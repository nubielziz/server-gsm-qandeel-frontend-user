"use client";
// The order form of a service (handoff §4.5). One form for the four service types:
//  - imei: one IMEI or a bulk list (≤ 100, one order per IMEI, all or none), checked with the Luhn digit as you type;
//  - quantity: a select (qtyOptions) or a number (min–max); a fixed quantity is not asked;
//  - custom fields (text / number / select / textarea) with the catalog's regex; a field keyed `imei` on an IMEI
//    service is the IMEI itself, so it is not shown twice;
//  - file services: an upload → `fileId` (required when the service has no fields).
// `POST /client/orders` has NO idempotency key: the button stays disabled from the first click until the answer, and
// nothing here ever retries a request on its own (a retry would be a second order).
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/browser";
import { isApiError, type FieldError } from "@/lib/api/errors";
import type { MerchantOrder, MerchantOrderInput, MerchantServiceDetail, UploadedFile } from "@/lib/api/types";
import { compareMoney, formatMoney, formatNumber, isValidImei, normalizeImei, subtractMoney } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { fmt, plural } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import type { MerchantMessages } from "@/lib/i18n/messages/merchant";
import { ltr } from "@/lib/merchant/format";
import { leaveIfSignedOut } from "@/lib/merchant/signed-out";
import { mulMoney } from "@/lib/merchant/money-math";
import {
  MAX_BULK_IMEIS,
  MAX_FIELD_VALUE,
  buildInputs,
  checkField,
  hasFieldErrors,
  mapOrderFieldErrors,
  parseImeiLines,
  parseQuantity,
  quantityRule,
  summarizeImeiLines,
  visibleFields,
  type OrderFieldErrors,
} from "@/lib/merchant/order-input";
import { FileUpload } from "@/components/forms/file-upload";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { toast } from "@/components/ui/toast";

export type OrderFormLabels = {
  form: MerchantMessages["form"];
  summary: MerchantMessages["summary"];
  errors: MerchantMessages["orderErrors"];
  placed: MerchantMessages["placed"];
};

export type OrderFormProps = {
  service: Pick<MerchantServiceDetail, "id" | "name" | "type" | "price" | "currency" | "minQty" | "maxQty" | "qtyOptions" | "fields">;
  /** The wallet's spendable balance (`available`), or null when it could not be read. */
  available: string | null;
  locale: Locale;
  hrefs: { orders: string; orderBase: string; topUp: string; services: string };
  labels: OrderFormLabels;
  /** Server-rendered service details shown above the inputs. */
  intro: ReactNode;
};

type Banner =
  | { kind: "priceChanged"; listed: string; current: string }
  | { kind: "duplicate"; orderId: number | null }
  | { kind: "insufficient" }
  | { kind: "disabled" }
  | { kind: "fields" }
  | { kind: "generic"; message: string; reference?: string };

const ID = { imei: "order-imei", bulk: "order-bulk", quantity: "order-quantity", file: "order-file", field: (key: string) => `order-field-${key}` };

export function OrderForm({ service, available, locale, hrefs, labels, intro }: OrderFormProps) {
  const router = useRouter();
  const errorText = useErrorText();
  const { form: f, summary: s } = labels;

  const needsImei = service.type === "imei";
  const fields = visibleFields(service);
  const rule = quantityRule(service);
  const fileRequired = service.type === "file" && service.fields.length === 0;

  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [imei, setImei] = useState("");
  const [bulk, setBulk] = useState("");
  const [qtyText, setQtyText] = useState(() => (rule.kind === "fixed" ? String(rule.value) : rule.kind === "options" ? String(rule.options[0]) : String(rule.min)));
  const [values, setValues] = useState<Record<string, string>>({});
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Synchronous guard as well as the state: a second order is real money (no Idempotency-Key on this route).
  const inFlight = useRef(false);
  const [serverErrors, setServerErrors] = useState<OrderFieldErrors | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const sentLines = useRef<ReturnType<typeof parseImeiLines>>([]);

  // "Reload price": re-reads the service on the server (which also records the new price as the listed one).
  const [reloading, startReload] = useTransition();
  const wasReloading = useRef(false);
  useEffect(() => {
    if (reloading) wasReloading.current = true;
    else if (wasReloading.current) {
      wasReloading.current = false;
      setBanner((b) => (b?.kind === "priceChanged" ? null : b));
    }
  }, [reloading]);

  // ── What the form currently holds
  const lines = parseImeiLines(bulk);
  const list = summarizeImeiLines(lines);
  const imeiNormalized = normalizeImei(imei);
  const readyCount = lines.filter((l) => l.valid && !l.duplicate).length;
  const quantity = parseQuantity(qtyText, rule);
  const imeiCount = needsImei ? (mode === "single" ? 1 : Math.max(1, list.count)) : 1;
  const total = mulMoney(service.price, (quantity ?? (rule.kind === "fixed" ? rule.value : 1)) * imeiCount);
  const afterOrder = available === null ? null : subtractMoney(available, total);
  const lowBalance = available !== null && compareMoney(total, available) > 0;

  // ── Local checks (the API checks everything again; these only save a round trip)
  const local = {
    imei: needsImei && mode === "single" ? (imeiNormalized === "" ? f.imeiRequired : isValidImei(imeiNormalized) ? undefined : f.imeiBad) : undefined,
    bulk: needsImei && mode === "bulk" ? (list.count === 0 ? f.imeiRequired : list.tooMany ? fmt(f.tooMany, { max: MAX_BULK_IMEIS }) : !list.ok ? f.bulkFix : undefined) : undefined,
    quantity: quantity === null ? quantityProblem() : undefined,
    file: fileRequired && !file ? f.fileRequired : undefined,
    inputs: Object.fromEntries(
      fields.flatMap((field) => {
        const problem = checkField(field, values[field.key] ?? "");
        return problem ? [[field.key, fmt(f.problems[problem], { max: MAX_FIELD_VALUE })]] : [];
      }),
    ) as Record<string, string>,
  };

  function quantityProblem(): string {
    if (rule.kind === "range") return fmt(f.quantityInvalid, { min: formatNumber(rule.min, locale), max: formatNumber(rule.max, locale) });
    return f.problems.option;
  }

  const hasLocalErrors = Boolean(local.imei || local.bulk || local.quantity || local.file || Object.keys(local.inputs).length);

  /**
   * Line problems of the bulk list: shown after a submit, plus what the server said. Nothing appears on blur: a message
   * that pushes the page down between the press and the release of a tap on "Place order" cancels the tap.
   */
  const lineProblems: { line: number; text: string }[] = [];
  if (submitted) {
    for (const l of lines) {
      if (!l.valid) lineProblems.push({ line: l.line, text: fmt(f.lineInvalid, { line: l.line }) });
      else if (l.duplicate) lineProblems.push({ line: l.line, text: fmt(f.lineDuplicate, { line: l.line }) });
    }
  }
  for (const [line, text] of Object.entries(serverErrors?.lines ?? {})) {
    const n = Number(line);
    if (!lineProblems.some((p) => p.line === n)) lineProblems.push({ line: n, text: fmt(f.lineError, { line: n, message: text }) });
  }
  lineProblems.sort((a, b) => a.line - b.line);

  // What each control shows: a server answer wins; local checks appear after the first submit.
  const shown = {
    imei: serverErrors?.imei ?? (submitted ? local.imei : undefined),
    bulk: serverErrors?.imeis ?? (submitted ? local.bulk : undefined),
    quantity: serverErrors?.quantity ?? (submitted ? local.quantity : undefined),
    file: serverErrors?.fileId ?? (submitted ? local.file : undefined),
    input: (key: string) => serverErrors?.inputs[key] ?? (submitted ? local.inputs[key] : undefined),
  };

  function dropServerError(patch: Partial<OrderFieldErrors>) {
    setServerErrors((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function dropInputError(key: string) {
    setServerErrors((prev) => {
      if (!prev) return prev;
      const inputs = { ...prev.inputs };
      delete inputs[key];
      return { ...prev, inputs };
    });
  }

  function focusFirst(ids: string[]) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) {
        el.focus();
        return;
      }
    }
  }

  function firstInvalidIds(): string[] {
    const ids: string[] = [];
    if (local.imei) ids.push(ID.imei);
    if (local.bulk) ids.push(ID.bulk);
    if (local.quantity) ids.push(ID.quantity);
    for (const field of fields) if (local.inputs[field.key]) ids.push(ID.field(field.key));
    if (local.file) ids.push(ID.file);
    return ids;
  }

  function showBanner(next: Banner) {
    setBanner(next);
    // Move focus to the message so a screen reader announces it and keyboard users land on it.
    requestAnimationFrame(() => bannerRef.current?.focus());
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || inFlight.current) return; // one request at a time: there is no idempotency key to make a repeat safe
    setSubmitted(true);
    setBanner(null);
    setServerErrors(null);
    if (hasLocalErrors) {
      showBanner({ kind: "fields" });
      requestAnimationFrame(() => focusFirst(firstInvalidIds()));
      return;
    }

    const body: MerchantOrderInput = { serviceId: service.id };
    if (needsImei) {
      if (mode === "single") body.imei = imeiNormalized;
      else {
        sentLines.current = lines;
        body.imeis = lines.map((l) => l.imei);
      }
    }
    if (rule.kind !== "fixed" && quantity !== null) body.quantity = quantity;
    const inputs = buildInputs(fields, values);
    if (Object.keys(inputs).length > 0) body.inputs = inputs;
    if (file) body.fileId = file.id;

    inFlight.current = true;
    setSubmitting(true);
    try {
      const { orders } = await api.post<{ orders: MerchantOrder[] }>("/client/orders", body);
      // Stay disabled while the next page loads (submitting is not reset on success).
      if (orders.length === 1) {
        toast.success(fmt(labels.placed.one, { id: orders[0].id }));
        router.push(`${hrefs.orderBase}/${orders[0].id}`);
      } else {
        toast.success(fmt(labels.placed.many, { count: orders.length }), labels.placed.manyText);
        router.push(hrefs.orders);
      }
      router.refresh(); // the wallet pill in the header
    } catch (error) {
      inFlight.current = false;
      setSubmitting(false);
      handleError(error);
    }
  }

  /** The API names an invalid IMEI `invalid_imei` on the field (the whole error is `INVALID_IMEI`): say it as the form does. */
  function fieldText(fe: FieldError): string {
    return fe.code.toLowerCase() === "invalid_imei" ? f.imeiBad : (errorText.field(fe) ?? "");
  }

  function handleError(error: unknown) {
    if (leaveIfSignedOut(error, router)) return;
    if (!isApiError(error)) {
      showBanner({ kind: "generic", message: errorText.message(error) });
      return;
    }
    switch (error.code) {
      case "PRICE_CHANGED":
        showBanner({
          kind: "priceChanged",
          listed: String(error.extensions.listedPrice ?? ""),
          current: String(error.extensions.currentPrice ?? ""),
        });
        return;
      case "DUPLICATE_ORDER": {
        const id = Number(error.extensions.orderId);
        showBanner({ kind: "duplicate", orderId: Number.isSafeInteger(id) && id > 0 ? id : null });
        return;
      }
      case "INSUFFICIENT_FUNDS":
        showBanner({ kind: "insufficient" });
        return;
      case "SERVICE_DISABLED":
        showBanner({ kind: "disabled" });
        return;
      default:
    }
    if (error.status === 422 && error.fieldErrors.length > 0) {
      const mapped = mapOrderFieldErrors(error.fieldErrors, sentLines.current, fieldText);
      setServerErrors(mapped);
      if (hasFieldErrors(mapped)) {
        showBanner({ kind: "fields" });
        const ids: string[] = [];
        if (mapped.imei) ids.push(ID.imei);
        if (mapped.imeis || Object.keys(mapped.lines).length) ids.push(ID.bulk);
        if (mapped.quantity) ids.push(ID.quantity);
        for (const key of Object.keys(mapped.inputs)) ids.push(ID.field(key));
        if (mapped.fileId) ids.push(ID.file);
        requestAnimationFrame(() => focusFirst(ids));
        return;
      }
    }
    showBanner({ kind: "generic", message: errorText.message(error), reference: errorText.reference(error) });
  }

  // ── Render
  const optional = f.optional;
  return (
    <form onSubmit={onSubmit} noValidate aria-busy={submitting || undefined} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="grid min-w-0 gap-6">
        {intro}

        <div ref={bannerRef} tabIndex={-1} className="empty:hidden focus:outline-none" aria-live="polite">
          {banner ? <BannerView banner={banner} labels={labels} locale={locale} hrefs={hrefs} reloading={reloading} onReload={() => startReload(() => router.refresh())} generic={f} /> : null}
        </div>

        <Card>
          <CardHeader title={f.title} />
          <CardBody className="grid gap-5">
            {needsImei ? (
              <>
                <div className="grid gap-2">
                  <span className="text-small font-semibold text-ink">
                    {f.imeiMode}
                  </span>
                  <SegmentedControl
                    label={f.imeiMode}
                    value={mode}
                    onValueChange={(v) => setMode(v === "bulk" ? "bulk" : "single")}
                    options={[
                      { value: "single", label: f.single },
                      { value: "bulk", label: f.bulk },
                    ]}
                    className="w-full sm:w-fit"
                    fullWidth
                  />
                </div>

                {mode === "single" ? (
                  <div>
                    <Input
                      id={ID.imei}
                      name="imei"
                      label={f.imei}
                      required
                      value={imei}
                      onChange={(e) => {
                        setImei(e.target.value);
                        dropServerError({ imei: undefined });
                      }}
                      inputMode="numeric"
                      autoComplete="off"
                      spellCheck={false}
                      dir="ltr"
                      maxLength={64}
                      error={shown.imei}
                      hint={
                        imeiNormalized !== "" && isValidImei(imeiNormalized) ? (
                          <span className="text-success-ink">{f.imeiOk}</span>
                        ) : /^\d{15}$/.test(imeiNormalized) ? (
                          <span className="text-danger-ink">{f.imeiBad}</span>
                        ) : (
                          f.imeiHint
                        )
                      }
                    />
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Textarea
                      id={ID.bulk}
                      name="imeis"
                      label={f.bulkLabel}
                      required
                      rows={7}
                      value={bulk}
                      onChange={(e) => {
                        setBulk(e.target.value);
                        dropServerError({ imeis: undefined, lines: {} });
                      }}
                      autoComplete="off"
                      spellCheck={false}
                      dir="ltr"
                      className="font-mono"
                      error={shown.bulk}
                      hint={fmt(f.bulkHint, { max: MAX_BULK_IMEIS })}
                    />
                    <p className="text-small font-semibold text-ink" aria-live="polite">
                      {plural(locale, readyCount, f.bulkReady, formatNumber(readyCount, locale))}
                      {list.invalid.length + list.duplicates.length > 0 ? ` · ${fmt(f.bulkToFix, { count: formatNumber(new Set([...list.invalid, ...list.duplicates].map((l) => l.line)).size, locale) })}` : ""}
                    </p>
                    {lineProblems.length > 0 ? (
                      <ul className="grid gap-1 rounded-control bg-danger-soft px-3 py-2.5 text-small text-danger-ink">
                        {lineProblems.slice(0, 8).map((p) => (
                          <li key={p.line}>{p.text}</li>
                        ))}
                        {lineProblems.length > 8 ? <li>… +{formatNumber(lineProblems.length - 8, locale)}</li> : null}
                      </ul>
                    ) : null}
                  </div>
                )}
              </>
            ) : null}

            {rule.kind === "options" ? (
              <Select
                id={ID.quantity}
                name="quantity"
                label={f.quantity}
                required
                value={qtyText}
                onChange={(e) => {
                  setQtyText(e.target.value);
                  dropServerError({ quantity: undefined });
                }}
                options={rule.options.map((n) => ({ value: String(n), label: formatNumber(n, locale) }))}
                error={shown.quantity}
                fieldClassName="sm:max-w-xs"
              />
            ) : rule.kind === "range" ? (
              <Input
                id={ID.quantity}
                name="quantity"
                label={f.quantity}
                required
                value={qtyText}
                onChange={(e) => {
                  setQtyText(e.target.value);
                  dropServerError({ quantity: undefined });
                }}
                inputMode="numeric"
                autoComplete="off"
                dir="ltr"
                hint={fmt(f.quantityRange, { min: formatNumber(rule.min, locale), max: formatNumber(rule.max, locale) })}
                error={shown.quantity}
                fieldClassName="sm:max-w-xs"
              />
            ) : null}

            {fields.map((field) => {
              const common = {
                id: ID.field(field.key),
                name: `inputs.${field.key}`,
                label: field.label,
                required: field.required,
                optionalLabel: optional,
                value: values[field.key] ?? "",
                error: shown.input(field.key),
              };
              const set = (v: string) => {
                setValues((prev) => ({ ...prev, [field.key]: v }));
                dropInputError(field.key);
              };
              if (field.fieldType === "select") {
                return (
                  <Select
                    key={field.key}
                    {...common}
                    placeholder={f.selectPlaceholder}
                    options={field.options.map((o) => ({ value: o, label: o }))}
                    onChange={(e) => set(e.target.value)}
                  />
                );
              }
              if (field.fieldType === "textarea") {
                return <Textarea key={field.key} {...common} rows={4} maxLength={MAX_FIELD_VALUE} onChange={(e) => set(e.target.value)} />;
              }
              return (
                <Input
                  key={field.key}
                  {...common}
                  inputMode={field.fieldType === "number" ? "decimal" : undefined}
                  autoComplete="off"
                  maxLength={MAX_FIELD_VALUE}
                  onChange={(e) => set(e.target.value)}
                />
              );
            })}

            {service.type === "file" ? (
              <div id={ID.file} tabIndex={-1} className="grid gap-2 focus:outline-none">
                <FileUpload
                  required={fileRequired}
                  max={1}
                  onChange={(files) => {
                    setFile(files[0] ?? null);
                    dropServerError({ fileId: undefined });
                  }}
                  labels={{
                    label: f.file,
                    choose: f.fileChoose,
                    hint: f.fileHint,
                    uploading: f.fileUploading,
                    remove: f.fileRemove,
                    tooLarge: f.fileTooLarge,
                    wrongType: f.fileWrongType,
                  }}
                />
                {shown.file ? (
                  <p role="alert" className="text-small font-medium text-danger-ink">
                    {shown.file}
                  </p>
                ) : null}
              </div>
            ) : null}

            {!needsImei && fields.length === 0 && service.type !== "file" ? <p className="text-body text-ink-muted">{f.noInputs}</p> : null}
          </CardBody>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-4">
        <Card>
          <CardHeader title={s.title} titleAs="h2" />
          <CardBody className="grid gap-4">
            <DescriptionList>
              <DescriptionItem label={s.service}>{service.name}</DescriptionItem>
              <DescriptionItem label={s.unitPrice}>
                <Money amount={service.price} currency={service.currency} locale={locale} />
              </DescriptionItem>
              <DescriptionItem label={s.quantity}>
                <span className="num">{formatNumber(quantity ?? (rule.kind === "fixed" ? rule.value : 1), locale)}</span>
              </DescriptionItem>
              {needsImei && mode === "bulk" ? (
                <DescriptionItem label={s.imeis}>
                  <span className="num">{formatNumber(imeiCount, locale)}</span>
                </DescriptionItem>
              ) : null}
              <DescriptionItem label={s.total} emphasis>
                <Money amount={total} currency={service.currency} locale={locale} />
              </DescriptionItem>
            </DescriptionList>

            {available !== null ? (
              <DescriptionList className="text-small">
                <DescriptionItem label={s.available}>
                  <Money amount={available} currency={service.currency} locale={locale} />
                </DescriptionItem>
                {afterOrder !== null ? (
                  <DescriptionItem label={s.after}>
                    <Money amount={afterOrder} currency={service.currency} locale={locale} />
                  </DescriptionItem>
                ) : null}
              </DescriptionList>
            ) : null}

            {lowBalance ? (
              <Alert tone="warning" action={<ButtonLink href={hrefs.topUp} size="sm" variant="secondary">{s.addFunds}</ButtonLink>}>
                {s.lowBalance}
              </Alert>
            ) : null}

            <Button type="submit" size="lg" block loading={submitting} aria-label={submitting ? s.placing : undefined}>
              <span>{s.place}</span>
              <span aria-hidden="true">·</span>
              <Money amount={total} currency={service.currency} locale={locale} />
            </Button>
            <p className="text-small text-ink-subtle">{s.note}</p>
          </CardBody>
        </Card>
      </aside>
    </form>
  );
}

function BannerView({
  banner,
  labels,
  locale,
  hrefs,
  reloading,
  onReload,
  generic,
}: {
  banner: Banner;
  labels: OrderFormLabels;
  locale: Locale;
  hrefs: OrderFormProps["hrefs"];
  reloading: boolean;
  onReload: () => void;
  generic: OrderFormLabels["form"];
}) {
  const e = labels.errors;
  switch (banner.kind) {
    case "priceChanged":
      return (
        <Alert
          tone="warning"
          title={e.priceChangedTitle}
          action={
            <Button size="sm" variant="secondary" loading={reloading} onClick={onReload}>
              {e.reload}
            </Button>
          }
        >
          {fmt(e.priceChangedText, {
            listed: banner.listed ? ltr(formatMoney(banner.listed, "USD", locale)) : "—",
            current: banner.current ? ltr(formatMoney(banner.current, "USD", locale)) : "—",
          })}
        </Alert>
      );
    case "duplicate":
      return (
        <Alert
          tone="warning"
          title={e.duplicateTitle}
          action={
            banner.orderId ? (
              <ButtonLink href={`${hrefs.orderBase}/${banner.orderId}`} size="sm" variant="secondary">
                {fmt(e.duplicateView, { id: banner.orderId })}
              </ButtonLink>
            ) : undefined
          }
        >
          {e.duplicateText}
        </Alert>
      );
    case "insufficient":
      return (
        <Alert
          tone="danger"
          title={e.insufficientTitle}
          action={
            <ButtonLink href={hrefs.topUp} size="sm" variant="secondary">
              {labels.summary.addFunds}
            </ButtonLink>
          }
        >
          {e.insufficientText}
        </Alert>
      );
    case "disabled":
      return (
        <Alert
          tone="danger"
          title={e.disabledTitle}
          action={
            <ButtonLink href={hrefs.services} size="sm" variant="secondary">
              {e.disabledBack}
            </ButtonLink>
          }
        >
          {e.disabledText}
        </Alert>
      );
    case "fields":
      return (
        <Alert tone="danger" title={generic.notPlacedTitle}>
          {generic.reviewFields}
        </Alert>
      );
    case "generic":
      return (
        <Alert tone="danger" title={generic.notPlacedTitle}>
          {banner.message}
          {banner.reference ? <span className="mt-1 block text-small num">{banner.reference}</span> : null}
        </Alert>
      );
  }
}
