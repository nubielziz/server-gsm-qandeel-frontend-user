"use client";
// The order form of a service (handoff §4.5). One form for the four service types, drawn from what the service lists
// (decision 007: no built-in box, no bulk list; one request is one order):
//  - custom fields (text / number / select / textarea / imei, and the ten checked types of decision 009) with the catalog's regex,
//    exactly as the API sends them. Every field is drawn and checked by its own type and Required tick, whatever the type of the
//    service (decision 008). A field of type `imei` is a numeric box with a live "valid / not valid" hint, checked with the check
//    digit, and sent as digits only under `inputs[<its key>]`. A field of a checked type (a list of IMEIs, an IMEISV, a serial, an
//    ICCID, an EID, a MEID, an ECID, a MAC address, a Mi lock code, a box serial number) is drawn by components/forms/typed-field.tsx
//    and judged by lib/checkout/field-types.ts with the server's rules and sentences. A service with no fields asks nothing (a file
//    service asks for its file);
//  - quantity (lib/quantity.ts decides): a select for two or more packs, a number box for a range, nothing for one
//    pack, an exact N or one per order; the rule and its refusals are worded by `quantityRuleText` and
//    `invalidQuantityText`, for the local check and for a server `invalid_quantity` alike;
//  - file services: an upload → `fileId` (required when the service has no fields).
// One submission = one `Idempotency-Key` (`POST /client/orders` replays the first answer for a repeated key and the
// same body): the key is the same while the same body is sent again (a lost answer, a double click) and new as soon
// as anything in the form changes; it is forgotten after a success and after 409 IDEMPOTENCY_KEY_REUSED, and kept
// after every other failure. 409 IDEMPOTENCY_IN_PROGRESS (the first request still runs) waits `Retry-After` and sends
// the same request again, at most 3 times. The button stays disabled from the first click until the answer, and a
// synchronous guard keeps a second click from starting a second send while the first is still in flight.
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/browser";
import { isApiError, type FieldError } from "@/lib/api/errors";
import { createIdempotencyKeys } from "@/lib/api/idempotency";
import type { MerchantOrder, MerchantOrderInput, MerchantServiceDetail, UploadedFile } from "@/lib/api/types";
import { compareMoney, formatMoney, formatNumber, isValidImei, normalizeImei, subtractMoney } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { isTypedFieldType } from "@/lib/checkout/field-types";
import { useErrorText } from "@/lib/i18n/error-text";
import { errorLine } from "@/lib/i18n/error-text-core";
import type { CommonMessages } from "@/lib/i18n/messages/common";
import type { MerchantMessages } from "@/lib/i18n/messages/merchant";
import { ltr } from "@/lib/merchant/format";
import { leaveIfSignedOut } from "@/lib/merchant/signed-out";
import { mulMoney } from "@/lib/merchant/money-math";
import {
  MAX_FIELD_VALUE,
  MAX_IN_PROGRESS_RETRIES,
  buildInputs,
  checkFieldIssue,
  defaultQuantityOf,
  hasFieldErrors,
  inProgressWaitMs,
  mapOrderFieldErrors,
  orderSignature,
  parseQuantity,
  placedHref,
  problemMessage,
  quantityRule,
  type OrderFieldErrors,
  type OrderFormHrefs,
  type ServiceField,
} from "@/lib/merchant/order-input";
import { fromMerchantRule, invalidQuantityText, quantityRuleText } from "@/lib/quantity";
import { FileUpload } from "@/components/forms/file-upload";
import { TypedField } from "@/components/forms/typed-field";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { toast } from "@/components/ui/toast";

export type OrderFormLabels = {
  form: MerchantMessages["form"];
  summary: MerchantMessages["summary"];
  errors: MerchantMessages["orderErrors"];
  placed: MerchantMessages["placed"];
  /** `common.quantity`: the rule and refusal sentences of lib/quantity.ts. */
  quantity: CommonMessages["quantity"];
};

export type OrderFormProps = {
  service: Pick<MerchantServiceDetail, "id" | "name" | "type" | "price" | "currency" | "minQty" | "maxQty" | "qtyOptions" | "fields">;
  /** The wallet's spendable balance (`available`), or null when it could not be read. */
  available: string | null;
  hrefs: OrderFormHrefs;
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
  /** 409 IDEMPOTENCY_IN_PROGRESS: the first request still runs; the form waits and sends the same request again. */
  | { kind: "processing" }
  | { kind: "generic"; message: string; reference?: string };

const ID = {
  quantity: "order-quantity",
  file: "order-file",
  field: (key: string) => `order-field-${key}`,
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function OrderForm({ service, available, hrefs, labels, intro }: OrderFormProps) {
  const router = useRouter();
  const errorText = useErrorText();
  const { form: f, summary: s } = labels;

  // Every field the service lists, in its own order (decision 007), each drawn and checked by its own type (decision 008).
  const fields = service.fields;
  // The boxes this form draws: a server error on any other path has no place on the page.
  const drawn = { inputKeys: new Set(fields.map((field) => field.key)), file: service.type === "file" };
  const rule = quantityRule(service);
  const wording = fromMerchantRule(service);
  const fileRequired = service.type === "file" && service.fields.length === 0;

  const [qtyText, setQtyText] = useState(() => String(defaultQuantityOf(rule)));
  const [values, setValues] = useState<Record<string, string>>({});
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Synchronous guard as well as the state: a second click must not start a second send before the state is applied.
  const inFlight = useRef(false);
  // One key per submission (plan D13): the same body keeps the key, a changed form takes a new one.
  const [keys] = useState(() => createIdempotencyKeys());
  // False once the form is gone (the next page opened): a wait for IDEMPOTENCY_IN_PROGRESS then ends without a send.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [serverErrors, setServerErrors] = useState<OrderFieldErrors | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  // Staff can change the rule while the page is open (the page is re-read after a refused quantity): keep what was
  // typed when the new rule still accepts it, else start again from the new default.
  const ruleSignature = JSON.stringify(rule);
  const [knownRule, setKnownRule] = useState(ruleSignature);
  if (knownRule !== ruleSignature) {
    setKnownRule(ruleSignature);
    if (parseQuantity(qtyText, rule) === null) setQtyText(String(defaultQuantityOf(rule)));
  }

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
  const quantity = parseQuantity(qtyText, rule);
  const shownQuantity = quantity ?? defaultQuantityOf(rule);
  const total = mulMoney(service.price, shownQuantity);
  const afterOrder = available === null ? null : subtractMoney(available, total);
  const lowBalance = available !== null && compareMoney(total, available) > 0;

  // ── Local checks (the API checks everything again; these only save a round trip)
  const local = {
    quantity: quantity === null ? quantityProblem() : undefined,
    file: fileRequired && !file ? f.fileRequired : undefined,
    inputs: Object.fromEntries(
      fields.flatMap((field) => {
        const issue = checkFieldIssue(field, values[field.key] ?? "");
        return issue ? [[field.key, problemMessage(issue, f, errorText)]] : [];
      }),
    ) as Record<string, string>,
  };

  /** What to say about a refused quantity: the pack list or the range, from the rule the page holds now. */
  function quantityProblem(): string {
    return invalidQuantityText(wording, labels.quantity);
  }

  const hasLocalErrors = Boolean(local.quantity || local.file || Object.keys(local.inputs).length);

  // What each control shows: a server answer wins; local checks appear after the first submit. Nothing appears on blur: a
  // message that pushes the page down between the press and the release of a tap on "Place order" cancels the tap.
  const shown = {
    // A server refusal is worded from the rule as it stands now (it may have been re-read since the answer came).
    quantity: serverErrors?.quantity ? quantityProblem() : submitted ? local.quantity : undefined,
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
    // The order of the page: the quantity, the fields in the service's order, the file.
    const ids: string[] = [];
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
    if (submitting || inFlight.current) return; // one send at a time; a repeat after it ends carries the same key
    setSubmitted(true);
    setBanner(null);
    setServerErrors(null);
    if (hasLocalErrors) {
      showBanner({ kind: "fields" });
      requestAnimationFrame(() => focusFirst(firstInvalidIds()));
      return;
    }

    const body: MerchantOrderInput = { serviceId: service.id };
    // Everything but "one per order" is sent: an exact N or a single pack is not asked, but the API orders `min` without it.
    if (quantity !== null && !(rule.kind === "fixed" && rule.value === 1)) body.quantity = quantity;
    // A field of type `imei` goes out as digits only, under its own key.
    const inputs = buildInputs(fields, values);
    if (Object.keys(inputs).length > 0) body.inputs = inputs;
    if (file) body.fileId = file.id;

    inFlight.current = true;
    setSubmitting(true);
    try {
      const order = await sendOrder(body);
      if (order === null) return; // the form was left while it waited
      keys.reset(); // a new submission starts with a new key
      // Stay disabled while the next page loads (submitting is not reset on success).
      toast.success(fmt(labels.placed.one, { id: order.id }));
      router.push(placedHref(order, hrefs));
      router.refresh(); // the wallet pill in the header
    } catch (error) {
      inFlight.current = false;
      setSubmitting(false);
      setBanner((b) => (b?.kind === "processing" ? null : b));
      handleError(error);
    }
  }

  /**
   * `POST /client/orders` with the key of this body. A replay answers 201 with the first answer, so the caller goes to
   * the order page, which reads the order's current status. `IDEMPOTENCY_IN_PROGRESS` waits `Retry-After` and sends the
   * same request again (same key), at most `MAX_IN_PROGRESS_RETRIES` times; then the error reaches the person, who can
   * press the button again (same body, same key). Returns the order (one request places one), or null when the form was left
   * during a wait.
   */
  async function sendOrder(body: MerchantOrderInput): Promise<MerchantOrder | null> {
    const key = keys.keyFor(orderSignature(body));
    for (let retry = 0; ; retry++) {
      try {
        const { orders } = await api.post<{ orders: MerchantOrder[] }>("/client/orders", body, { idempotencyKey: key });
        // One request places one order. An answer without it is a failed send (the generic message, the key kept for a retry).
        if (!orders[0]) throw new Error("POST /client/orders answered without an order");
        return orders[0];
      } catch (error) {
        if (!isApiError(error) || error.code !== "IDEMPOTENCY_IN_PROGRESS" || retry >= MAX_IN_PROGRESS_RETRIES) throw error;
        setBanner({ kind: "processing" }); // no focus move: it is a wait, not a failure
        await sleep(inProgressWaitMs(error.retryAfter));
        if (!alive.current) return null;
      }
    }
  }

  /**
   * The API names an invalid IMEI `invalid_imei` on the field (the whole error is `INVALID_IMEI`): say it as the form does. A line of a
   * list of IMEIs has the same code and a message that names the line ("Line 3 ..."): that one is worded with its line.
   */
  function fieldText(fe: FieldError): string {
    return fe.code.toLowerCase() === "invalid_imei" && errorLine(fe) === null ? f.imeiBad : (errorText.field(fe) ?? "");
  }

  function handleError(error: unknown) {
    if (leaveIfSignedOut(error, router)) return;
    if (!isApiError(error)) {
      showBanner({ kind: "generic", message: errorText.message(error) });
      return;
    }
    // The key was used for another body (never meant to happen): forget it, so the next press starts a new submission.
    if (error.code === "IDEMPOTENCY_KEY_REUSED") keys.reset();
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
      const mapped = mapOrderFieldErrors(error.fieldErrors, drawn, fieldText);
      setServerErrors(mapped);
      const placed = hasFieldErrors(mapped);
      if (placed || mapped.other.length > 0) {
        // An error the form draws no box for (`serviceId`, `body`, an input the service no longer lists, `imei` of an older API) is
        // said as it is, never lost: its message is the banner's, also when other errors sit on boxes.
        showBanner(
          mapped.other.length > 0
            ? { kind: "generic", message: mapped.other[0], reference: errorText.reference(error) }
            : { kind: "fields" },
        );
        if (placed) {
          if (mapped.quantity) router.refresh(); // the rule may have changed: read the service again
          // The order of the page: the quantity, the fields in the service's order, the file.
          const ids: string[] = [];
          if (mapped.quantity) ids.push(ID.quantity);
          for (const field of fields) if (mapped.inputs[field.key]) ids.push(ID.field(field.key));
          if (mapped.fileId) ids.push(ID.file);
          requestAnimationFrame(() => focusFirst(ids));
        }
        return;
      }
    }
    showBanner({ kind: "generic", message: errorText.message(error), reference: errorText.reference(error) });
  }

  // ── Render
  const optional = f.optional;

  /** One custom field, drawn by its type. A field of type `imei` is a one-line numeric box with the check-digit hint. */
  function renderField(field: ServiceField) {
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
    if (field.fieldType === "imei") {
      const imei = normalizeImei(common.value);
      return (
        <Input
          key={field.key}
          {...common}
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          dir="ltr"
          maxLength={24}
          hint={
            imei !== "" && isValidImei(imei) ? (
              <span className="text-success-ink">{f.imeiOk}</span>
            ) : /^\d{15}$/.test(imei) ? (
              <span className="text-danger-ink">{f.imeiBad}</span>
            ) : (
              f.imeiHint
            )
          }
          onChange={(e) => set(e.target.value)}
        />
      );
    }
    if (isTypedFieldType(field.fieldType)) {
      // One of the ten checked types (decision 009): its own control, hint and keyboard, in lib/checkout/field-types.ts.
      return (
        <TypedField
          key={field.key}
          type={field.fieldType}
          labels={f.types}
          id={common.id}
          name={common.name}
          label={field.label}
          required={field.required}
          optionalLabel={optional}
          value={common.value}
          error={common.error}
          onChange={set}
        />
      );
    }
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
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={submitting || undefined} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="grid min-w-0 gap-6">
        {intro}

        <div ref={bannerRef} tabIndex={-1} className="empty:hidden focus:outline-none" aria-live="polite">
          {banner ? <BannerView banner={banner} labels={labels} hrefs={hrefs} reloading={reloading} onReload={() => startReload(() => router.refresh())} generic={f} /> : null}
        </div>

        <Card>
          <CardHeader title={f.title} />
          <CardBody className="grid gap-5">
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
                options={rule.options.map((n) => ({ value: String(n), label: formatNumber(n) }))}
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
                hint={<bdi>{quantityRuleText(wording, labels.quantity)}</bdi>}
                error={shown.quantity}
                fieldClassName="sm:max-w-xs"
              />
            ) : shown.quantity ? (
              // One quantity only, so there is no control to hold the message: a refusal after the rule changed.
              <p id={ID.quantity} tabIndex={-1} role="alert" className="text-small font-medium text-danger-ink focus:outline-none">
                {shown.quantity}
              </p>
            ) : null}

            {fields.map(renderField)}

            {service.type === "file" ? (
              <div id={ID.file} tabIndex={-1} className="grid gap-2 focus:outline-none">
                <FileUpload
                  family="client"
                  required={fileRequired}
                  onChange={(next) => {
                    setFile(next);
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

            {fields.length === 0 && service.type !== "file" ? <p className="text-body text-ink-muted">{f.noInputs}</p> : null}
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
                <Money amount={service.price} currency={service.currency} />
              </DescriptionItem>
              <DescriptionItem label={s.quantity}>
                <span className="num">{formatNumber(shownQuantity)}</span>
              </DescriptionItem>
              <DescriptionItem label={s.total} emphasis>
                <Money amount={total} currency={service.currency} />
              </DescriptionItem>
            </DescriptionList>

            {available !== null ? (
              <DescriptionList className="text-small">
                <DescriptionItem label={s.available}>
                  <Money amount={available} currency={service.currency} />
                </DescriptionItem>
                {afterOrder !== null ? (
                  <DescriptionItem label={s.after}>
                    <Money amount={afterOrder} currency={service.currency} />
                  </DescriptionItem>
                ) : null}
              </DescriptionList>
            ) : null}

            {lowBalance ? (
              <Alert tone="warning" action={<ButtonLink href={hrefs.topUp} size="sm" variant="secondary">{s.addFunds}</ButtonLink>}>
                {s.lowBalance}
              </Alert>
            ) : null}

            <Button
              type="submit"
              size="lg"
              block
              loading={submitting}
              aria-label={submitting ? s.placing : undefined}
            >
              <span>{s.place}</span>
              <span aria-hidden="true">·</span>
              <Money amount={total} currency={service.currency} />
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
  hrefs,
  reloading,
  onReload,
  generic,
}: {
  banner: Banner;
  labels: OrderFormLabels;
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
            listed: banner.listed ? ltr(formatMoney(banner.listed, "USD")) : "—",
            current: banner.current ? ltr(formatMoney(banner.current, "USD")) : "—",
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
    case "processing":
      return <Alert tone="info">{generic.stillProcessing}</Alert>;
    case "generic":
      return (
        <Alert tone="danger" title={generic.notPlacedTitle}>
          {banner.message}
          {banner.reference ? <span className="mt-1 block text-small num">{banner.reference}</span> : null}
        </Alert>
      );
  }
}
