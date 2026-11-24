"use client";
// Opening a checkout (mockup "Secure Checkout"): service information with the "Service requirements" drawer, the buyer's
// details (email, country → tax, currency), the order summary with an indicative price, Turnstile and
// "Continue to payment" → POST /store/v1/checkout-sessions → /en/checkout/<token>. The amounts on this page are
// indicative: the session locks price, tax and exchange rate for 30 minutes on the next page (handoff §5.8).
// The quantity rule of the service (a range, packs, exactly N) is state, not a constant: it starts from the server-rendered
// service and is replaced by every re-read of the service (currency, country, region, a server refusal) (plan D17).
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock, Hash, Lock, Pencil } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DialogClose, DialogTrigger, Drawer, closeDialog, openDialog } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Turnstile } from "@/components/turnstile";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import type { CheckoutSession, CheckoutSessionInput, StoreConfig, StoreServiceDetail } from "@/lib/api/types";
import { priceListHref, type CheckoutBuyer } from "@/lib/checkout/access";
import { formatDateTime, formatNumber, formatPercent, isValidImei, normalizeImei } from "@/lib/format";
import { fmt, plural } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import { isRankRefusal } from "@/lib/merchant/signed-out";
import { sitePath } from "@/lib/site-path";
import type { CheckoutMessages } from "@/lib/i18n/messages/checkout";
import type { CommonMessages } from "@/lib/i18n/messages/common";
import {
  coerceQuantity,
  defaultQuantity,
  invalidQuantityText,
  isAllowedQuantity,
  parseQuantityInput,
  quantityMode,
  quantityRuleText,
  type QuantityRule,
} from "@/lib/quantity";
import { deliveryLine, stockHint } from "@/lib/store/delivery";
import { multiplyMoney, isPositiveMoney } from "./money-math";
import { PriceListCard } from "./price-list-card";
import { focusQuantityControl, INVALID_SELECTOR, QuantityControl } from "./quantity-control";

type Labels = CheckoutMessages["start"];

export type CheckoutFormProps = {
  labels: Labels;
  /** `common.quantity`: the rule texts, the plural "Subtotal (N units)" and "per unit". */
  quantityLabels: CommonMessages["quantity"];
  /** `common.delivery`: the delivery line and the in-stock hint. */
  deliveryLabels: CommonMessages["delivery"];
  /** Labels of the service type ("IMEI check"). */
  typeLabel: string;
  service: {
    id: number;
    slug: string;
    title: string;
    isImei: boolean;
    /** The rule when the page was rendered; the form reads it again and keeps the newest. */
    quantity: StoreServiceDetail["quantity"];
    availability: StoreServiceDetail["availability"];
    etaText: StoreServiceDetail["etaText"];
    deliveryMinutes: StoreServiceDetail["deliveryMinutes"];
    fields: StoreServiceDetail["fields"];
    /** The price in the visitor's currency, without tax (no country yet). */
    price: StoreServiceDetail["price"];
  };
  /** Server-rendered service art (an image or an icon tile). */
  art: ReactNode;
  currencies: StoreConfig["currencies"];
  /** The visitor's shop currency. */
  currency: string;
  taxRates: StoreConfig["taxRates"];
  countries: { code: string; name: string }[];
  /** The signed-in account of a retail rank: its email is locked, its country prefilled. Null for a guest checkout. */
  account: CheckoutBuyer | null;
  signInHref: string;
  supportHref: string;
  /** `utm_*` values of the landing URL (the abandoned-checkout report reads `source`). */
  utm?: NonNullable<CheckoutSessionInput["utm"]>;
  /** The `?quantity=` of the URL (a restarted or resumed checkout keeps it): checked against today's rule. */
  initialQuantity?: number | null;
};

type FormError = { message: string; reference?: string; signIn?: boolean; support?: boolean };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DRAWER_FIELD = /^(imei|quantity|inputs\..+)$/;

/** The server refuses a quantity with these field codes (`invalid_quantity`, or the schema's own limits). */
const QUANTITY_CODES = new Set(["invalid_quantity", "too_small", "too_big", "invalid_type"]);

function refusesQuantity(error: unknown): boolean {
  return isApiError(error) && error.status === 422 && error.fieldErrors.some((fe) => fe.field === "quantity" && QUANTITY_CODES.has(fe.code));
}

function sameRule(a: QuantityRule, b: QuantityRule): boolean {
  return a.min === b.min && a.max === b.max && a.options.length === b.options.length && a.options.every((n, i) => n === b.options[i]);
}

/** True for the modes that ask the buyer to choose (a range, packs): they need the drawer. */
function hasControl(rule: QuantityRule): boolean {
  const kind = quantityMode(rule).kind;
  return kind === "range" || kind === "packs";
}

function maskImei(imei: string): string {
  const digits = normalizeImei(imei);
  return digits.length > 4 ? `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}` : digits;
}

export function CheckoutForm({
  labels,
  quantityLabels,
  deliveryLabels,
  typeLabel,
  service,
  art,
  currencies,
  currency: defaultCurrency,
  taxRates,
  countries,
  account,
  signInHref,
  supportHref,
  utm,
  initialQuantity,
}: CheckoutFormProps) {
  const router = useRouter();
  const errorText = useErrorText();
  const drawerFormId = useId().replace(/:/g, "");
  // The "Service requirements" drawer is uncontrolled (`id` mode): its triggers are native `show-modal` commands, so it
  // opens from the server HTML before hydration (plan P4.1); code opens and closes it by this id.
  const drawerId = `${drawerFormId}-drawer`;

  const { fields } = service;
  // The URL's quantity, checked once against the rule the page was rendered with (a rule that no longer allows it falls
  // back to the default and says so).
  const [initial] = useState(() => coerceQuantity(service.quantity, initialQuantity));
  const [rule, setRule] = useState<QuantityRule>(service.quantity);
  const [live, setLive] = useState({ availability: service.availability, etaText: service.etaText, deliveryMinutes: service.deliveryMinutes });
  const ruleRef = useRef<QuantityRule>(service.quantity);
  const quantityRef = useRef(String(initial.quantity));
  const mode = quantityMode(rule);
  const controlled = hasControl(rule);
  const needsDetails = service.isImei || fields.length > 0 || controlled;

  const [email, setEmail] = useState(account?.email ?? "");
  const [country, setCountry] = useState(account?.country ?? "");
  const [region, setRegion] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [imei, setImei] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(String(initial.quantity));
  const [quantityNotice, setQuantityNotice] = useState(initial.changed);
  const [detailsSaved, setDetailsSaved] = useState(!needsDetails);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<FormError>();
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  // The API refused the session because the account's rank orders from its price list (403 RANK_NOT_ALLOWED): the page never
  // mounts this form for such an account, so this is a rank that changed after the page loaded. The same card takes its place.
  const [priceListOnly, setPriceListOnly] = useState(false);

  // ── The service as the API has it now (rule, availability, delivery, price): one read for the effect below and for
  // a server refusal. Currency, country and region change the price; the rule and the delivery come along.
  const readService = useCallback(
    (signal?: AbortSignal) =>
      api.get<StoreServiceDetail>(`/store/v1/services/${encodeURIComponent(service.slug)}`, {
        query: { currency, buyerCountry: country || undefined, region: region || undefined },
        signal,
      }),
    [service.slug, currency, country, region],
  );

  /**
   * Takes the rule of a fresh read as the rule of the form. When it differs, the control is redrawn and a quantity the new
   * rule does not allow is replaced: by the default with a notice (a silent change), or, after a server refusal, by
   * nothing for packs (the buyer chooses again) and by the typed number for a range (the refusal text is shown).
   */
  const applyService = useCallback(
    (detail: StoreServiceDetail, after: "silent" | "refusal"): QuantityRule => {
      setLive({ availability: detail.availability, etaText: detail.etaText, deliveryMinutes: detail.deliveryMinutes });
      const previous = ruleRef.current;
      const next = detail.quantity;
      if (sameRule(previous, next)) return previous;
      ruleRef.current = next;
      setRule(next);
      const typed = parseQuantityInput(quantityRef.current);
      const kept = typed !== null && isAllowedQuantity(next, typed);
      if (!kept) {
        const kind = quantityMode(next).kind;
        const value =
          after === "refusal" && kind === "packs" ? "" : after === "refusal" && kind === "range" ? quantityRef.current : String(defaultQuantity(next));
        quantityRef.current = value;
        setQuantity(value);
        if (after === "silent" && typed !== null) setQuantityNotice(true);
      }
      const needs = service.isImei || fields.length > 0 || hasControl(next);
      // Whatever the buyer saved before no longer matches the form: ask again. Nothing to enter: nothing to ask.
      if (!needs) setDetailsSaved(true);
      else if (!kept || (!hasControl(previous) && hasControl(next))) setDetailsSaved(false);
      return next;
    },
    [service.isImei, fields.length],
  );

  // ── Indicative price: the service card in the chosen currency and, once known, the buyer's country (tax included).
  const [price, setPrice] = useState(service.price);
  const [priceBusy, setPriceBusy] = useState(false);
  const lastPriceKey = useRef(`${defaultCurrency}||`);
  useEffect(() => {
    const key = `${currency}|${country}|${region}`;
    if (key === lastPriceKey.current) return;
    lastPriceKey.current = key;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setPriceBusy(true);
      readService(controller.signal)
        .then((detail) => {
          setPrice(detail.price);
          applyService(detail, "silent");
        })
        .catch(() => undefined)
        .finally(() => {
          if (!controller.signal.aborted) setPriceBusy(false);
        });
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [currency, country, region, readService, applyService]);

  const regionChoices = country ? taxRates.filter((rate) => rate.country === country && rate.region) : [];
  const decimals = currencies.find((c) => c.code === price.currency)?.decimals ?? 2;
  // The quantity the summary shows: the buyer's, when the rule allows it; else what a request without one would order.
  const typedQuantity = parseQuantityInput(quantity);
  const qtyNumber = typedQuantity !== null && isAllowedQuantity(rule, typedQuantity) ? typedQuantity : defaultQuantity(rule);
  const taxRate = country ? taxRates.find((rate) => rate.country === country && (!region || rate.region === region || !rate.region)) : undefined;
  const countryLabel = countries.find((c) => c.code === country)?.name ?? country;

  const fieldMessage = (code: string) => errorText.field({ field: "", code, message: "" }) ?? "";

  /** Errors of the drawer's fields (IMEI, order fields, quantity). */
  function detailErrors(): Record<string, string> {
    const found: Record<string, string> = {};
    if (service.isImei) {
      const digits = normalizeImei(imei);
      if (!/^\d{15}$/.test(digits)) found.imei = labels.drawer.errorLength;
      else if (!isValidImei(digits)) found.imei = labels.drawer.errorChecksum;
    }
    for (const field of fields) {
      if (field.required && !(inputs[field.key] ?? "").trim()) found[`inputs.${field.key}`] = labels.drawer.errorRequired;
    }
    // One per order and exactly N have no control: the rule decides the quantity.
    if (controlled && (typedQuantity === null || !isAllowedQuantity(rule, typedQuantity))) {
      found.quantity = invalidQuantityText(rule, quantityLabels);
    }
    return found;
  }

  function reveal(found: Record<string, string>) {
    if (Object.keys(found).some((key) => DRAWER_FIELD.test(key))) openDialog(drawerId);
    setTimeout(() => {
      const target =
        document.querySelector<HTMLElement>(`dialog[open] :is(${INVALID_SELECTOR})`) ??
        document.querySelector<HTMLElement>(`form :is(${INVALID_SELECTOR})`);
      // A group of packs is a fieldset: the focus goes to one of its radio buttons.
      if (target instanceof HTMLFieldSetElement) focusQuantityControl();
      else target?.focus();
    }, 80);
  }

  function saveDetails(event?: FormEvent) {
    event?.preventDefault();
    const found = detailErrors();
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) if (DRAWER_FIELD.test(key)) delete next[key];
      return { ...next, ...found };
    });
    if (Object.keys(found).length > 0) {
      reveal(found);
      return;
    }
    setDetailsSaved(true);
    closeDialog(drawerId);
  }

  function describe(error: unknown): { fields: Record<string, string>; form?: FormError } {
    if (!isApiError(error)) return { fields: {}, form: { message: errorText.message(error) } };
    const reference = errorText.reference(error);
    if (error.status === 401) return { fields: {}, form: { message: labels.errors.guestOff, signIn: true } };
    if (error.status === 403 && error.code === "ACCOUNT_SUSPENDED") {
      return { fields: {}, form: { message: labels.errors.suspended, reference, support: true } };
    }
    if (error.code === "MAINTENANCE") {
      const until = typeof error.extensions.expectedEndAt === "string" ? formatDateTime(error.extensions.expectedEndAt) : "";
      return {
        fields: {},
        form: { message: `${labels.errors.maintenance}${until ? ` ${fmt(labels.errors.maintenanceUntil, { time: until })}` : ""}`, reference },
      };
    }
    const fieldsOut: Record<string, string> = {};
    let form: FormError | undefined;
    for (const fe of error.fieldErrors) {
      const text = errorText.field(fe) ?? labels.errors.fixFields;
      if (fe.field === "serviceId") form = { message: text || labels.errors.service, reference, support: true };
      else if (fe.field && fe.field !== "body" && fe.field !== "query") fieldsOut[fe.field] ??= text;
      else form = { message: text, reference };
    }
    if (!form && Object.keys(fieldsOut).length === 0) form = { message: errorText.message(error), reference };
    return { fields: fieldsOut, form };
  }

  /** The sentence for a quantity the server refused: read from the rule as the API has it now (the one we have if the read fails). */
  async function quantityRefusalText(): Promise<string> {
    let current = ruleRef.current;
    try {
      const detail = await readService();
      setPrice(detail.price);
      current = applyService(detail, "refusal");
    } catch {
      // keep the rule we have
    }
    return invalidQuantityText(current, quantityLabels);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found: Record<string, string> = { ...detailErrors() };
    if (!EMAIL.test(email.trim())) found.email = fieldMessage(email.trim() ? "invalid_string" : "required");
    if (!country) found.country = fieldMessage("required");
    setErrors(found);
    setFormError(undefined);
    if (Object.keys(found).length > 0) {
      reveal(found);
      return;
    }
    if (!token) return;

    const filled = Object.fromEntries(Object.entries(inputs).filter(([key, value]) => value.trim() && fields.some((f) => f.key === key)));
    const body: CheckoutSessionInput = {
      serviceId: service.id,
      email: email.trim(),
      country,
      currency,
      quantity: qtyNumber,
      ...(region && regionChoices.some((r) => r.region === region) ? { region } : {}),
      ...(service.isImei ? { imei: normalizeImei(imei) } : {}),
      ...(Object.keys(filled).length > 0 ? { inputs: filled } : {}),
      ...(utm && Object.keys(utm).length > 0 ? { utm } : {}),
    };

    setBusy(true);
    try {
      const session = await api.post<CheckoutSession>("/store/v1/checkout-sessions", body, { turnstileToken: token });
      router.push(sitePath(`/checkout/${encodeURIComponent(session.token)}`));
      return; // stay busy while the next page opens
    } catch (error) {
      if (isRankRefusal(error)) {
        setPriceListOnly(true);
        setBusy(false);
        return;
      }
      const { fields: fieldsOut, form: formOut } = describe(error);
      let form = formOut;
      if (refusesQuantity(error)) {
        // The server's text is English and may describe a rule that has changed: read the service again, redraw the
        // control for today's rule and say what that rule is.
        const text = await quantityRefusalText();
        if (service.isImei || fields.length > 0 || hasControl(ruleRef.current)) fieldsOut.quantity = text;
        else {
          delete fieldsOut.quantity;
          form = { message: text, reference: errorText.reference(error) };
        }
      }
      setErrors(fieldsOut);
      setFormError(form);
      if (Object.keys(fieldsOut).length > 0) reveal(fieldsOut);
      else document.getElementById("checkout-error")?.focus();
    }
    // A Turnstile token is single use and spent even by a failed request: get a fresh one.
    setToken(null);
    setResetKey((key) => key + 1);
    setBusy(false);
  }

  // ── Pieces
  const setInput = (key: string, value: string) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[`inputs.${key}`]) return prev;
      const next = { ...prev };
      delete next[`inputs.${key}`];
      return next;
    });
  };
  const clearError = (key: string) =>
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  function changeQuantity(value: string) {
    quantityRef.current = value;
    setQuantity(value);
    setQuantityNotice(false);
    clearError("quantity");
  }

  const detailsStatus = !needsDetails ? (
    <span className="text-small text-ink-muted">{labels.info.none}</span>
  ) : detailsSaved ? (
    <span className="flex items-center gap-2 text-small font-semibold text-success-ink">
      <span aria-hidden="true" className="size-2.5 rounded-full bg-success" />
      {labels.info.done}
    </span>
  ) : (
    <span className="flex items-center gap-2 text-small font-semibold text-warning-ink">
      <span aria-hidden="true" className="size-2.5 rounded-full bg-warning" />
      {labels.info.required}
    </span>
  );

  const unitDecimals = decimals;
  const showTotals = qtyNumber > 1;
  const deliveryText = deliveryLine(live, deliveryLabels);
  const ruleText = quantityRuleText(rule, quantityLabels);
  const stockNote = stockHint({ ...live, quantity: rule }, deliveryLabels);
  const net = multiplyMoney(price.net, qtyNumber);
  const tax = multiplyMoney(price.tax, qtyNumber);
  const gross = multiplyMoney(price.gross, qtyNumber);
  const taxKnown = Boolean(country);
  const taxApplies = taxKnown && isPositiveMoney(price.tax);

  if (priceListOnly) {
    return (
      <PriceListCard
        labels={labels.priceList}
        priceListHref={priceListHref(service.id)}
        serviceHref={sitePath(`/services/${encodeURIComponent(service.slug)}`)}
      />
    );
  }

  return (
    <>
      <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <Card>
            <CardHeader title={labels.info.title} description={labels.info.description} />
            <CardBody>
              <div className="flex flex-col gap-4 rounded-card border border-line bg-surface-muted p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="w-24 shrink-0 overflow-hidden rounded-control">{art}</div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-subheading text-ink">{service.title}</h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-subtle">
                      <Badge tone="outline" shape="tag">
                        {typeLabel}
                      </Badge>
                      {deliveryText ? (
                        <span className="flex items-center gap-1">
                          <Clock aria-hidden="true" className="size-3.5" />
                          <bdi>{deliveryText}</bdi>
                        </span>
                      ) : null}
                      {mode.kind !== "single" ? (
                        <span className="flex items-center gap-1">
                          <Hash aria-hidden="true" className="size-3.5" />
                          <bdi>{ruleText}</bdi>
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-2">{detailsStatus}</p>
                  </div>
                </div>
                {needsDetails ? (
                  <DialogTrigger
                    for={drawerId}
                    variant="secondary"
                    size="sm"
                    startIcon={detailsSaved ? <Pencil aria-hidden="true" /> : undefined}
                    className="self-start sm:self-center"
                  >
                    {detailsSaved ? labels.info.edit : labels.info.enter}
                  </DialogTrigger>
                ) : null}
              </div>
              {quantityNotice ? (
                <Alert tone="info" className="mt-4">
                  {labels.info.quantityChanged}
                </Alert>
              ) : null}
              {needsDetails && detailsSaved ? (
                <dl className="mt-4 grid gap-2 text-body">
                  {service.isImei ? (
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-subtle">{labels.info.imei}</dt>
                      <dd className="num font-semibold text-ink" dir="ltr">
                        {maskImei(imei)}
                      </dd>
                    </div>
                  ) : null}
                  {controlled ? (
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-subtle">{labels.info.quantity}</dt>
                      <dd className="num font-semibold text-ink">{formatNumber(qtyNumber)}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={labels.you.title} description={labels.you.description} />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <Input
                fieldClassName="content-start sm:col-span-2"
                type="email"
                name="email"
                label={labels.you.email}
                hint={account ? labels.you.emailSignedIn : labels.you.emailHint}
                error={errors.email}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearError("email");
                }}
                readOnly={Boolean(account)}
                autoComplete="email"
                required
              />
              <Select
                name="country"
                fieldClassName="content-start"
                label={labels.you.country}
                hint={labels.you.countryHint}
                error={errors.country}
                value={country}
                onChange={(event) => {
                  setCountry(event.target.value);
                  setRegion("");
                  clearError("country");
                }}
                placeholder={labels.you.countryPlaceholder}
                options={countries.map((c) => ({ value: c.code, label: c.name }))}
                autoComplete="country"
                required
              />
              {regionChoices.length > 0 ? (
                <Select
                  name="region"
                  fieldClassName="content-start"
                  label={labels.you.region}
                  error={errors.region}
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                  options={[
                    { value: "", label: labels.you.regionOther },
                    ...regionChoices.map((r) => ({ value: r.region, label: r.region })),
                  ]}
                />
              ) : null}
              <Select
                name="currency"
                fieldClassName="content-start"
                label={labels.you.currency}
                hint={labels.you.currencyHint}
                error={errors.currency}
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                options={currencies.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))}
              />
              {!account ? (
                <p className="text-small text-ink-subtle sm:col-span-2">
                  {labels.you.haveAccount}{" "}
                  <Link href={signInHref} className="font-semibold text-ink underline underline-offset-4">
                    {labels.you.signIn}
                  </Link>
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-6">
          <CardHeader title={labels.summary.title} />
          <CardBody className="grid gap-4">
            <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
              <div className="min-w-0">
                <p className="text-body font-semibold text-ink">{service.title}</p>
                <p className="text-small text-ink-subtle">{fmt(labels.summary.quantity, { count: formatNumber(qtyNumber) })}</p>
              </div>
            </div>

            {needsDetails && !detailsSaved ? (
              <div className="flex items-center justify-between gap-3 rounded-control bg-warning-soft px-3 py-2.5">
                <span className="flex items-center gap-2 text-small font-semibold text-warning-ink">
                  <span aria-hidden="true" className="size-2.5 rounded-full bg-warning" />
                  {labels.summary.detailsRequired}
                </span>
                <DialogTrigger for={drawerId} variant="secondary" size="sm">
                  {labels.info.enter}
                </DialogTrigger>
              </div>
            ) : null}

            <dl aria-live="polite" aria-busy={priceBusy} className={priceBusy ? "grid gap-2.5 opacity-60 transition-opacity" : "grid gap-2.5 transition-opacity"}>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-body text-ink-muted">{showTotals ? labels.summary.priceEach : labels.summary.price}</dt>
                <dd className="text-body font-medium text-ink">
                  <Money amount={price.net} currency={price.currency} decimals={unitDecimals} />
                </dd>
              </div>
              {showTotals ? (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-body text-ink-muted">{plural(qtyNumber, quantityLabels.subtotal, formatNumber(qtyNumber))}</dt>
                  <dd className="text-body font-medium text-ink">
                    <Money amount={net} currency={price.currency} decimals={unitDecimals} />
                  </dd>
                </div>
              ) : null}
              {taxKnown ? (
                taxApplies ? (
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-body text-ink-muted">
                      {fmt(labels.summary.tax, { rate: formatPercent(price.taxRate || taxRate?.ratePercent || "0") })}
                    </dt>
                    <dd className="text-body font-medium text-ink">
                      <Money amount={tax} currency={price.currency} decimals={unitDecimals} />
                    </dd>
                  </div>
                ) : (
                  <p className="text-small text-ink-subtle">{fmt(labels.summary.taxNone, { country: countryLabel })}</p>
                )
              ) : (
                <p className="text-small text-ink-subtle">{labels.summary.taxPending}</p>
              )}
              <div className="flex items-baseline justify-between gap-4 rounded-control bg-surface-muted px-3 py-3">
                <dt className="text-heading font-bold text-ink">{showTotals ? labels.summary.estimate : labels.summary.total}</dt>
                <dd className="text-heading font-extrabold text-ink">
                  <Money amount={taxKnown ? gross : net} currency={price.currency} decimals={unitDecimals} />
                </dd>
              </div>
            </dl>
            {priceBusy ? <p className="-mt-2 text-small text-ink-subtle">{labels.summary.updating}</p> : null}
            <p className="flex items-start gap-2 text-small text-ink-subtle">
              <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {labels.summary.locked}
            </p>

            <Turnstile onToken={setToken} resetKey={resetKey} />

            {formError ? (
              <div id="checkout-error" tabIndex={-1} className="outline-none">
                <Alert tone="danger" title={labels.errors.title}>
                  <p>{formError.message}</p>
                  {formError.reference ? <p dir="ltr" className="mt-1 text-small num">{formError.reference}</p> : null}
                  {formError.signIn || formError.support ? (
                    <p className="mt-2">
                      <ButtonLink href={formError.signIn ? signInHref : supportHref} variant="secondary" size="sm">
                        {formError.signIn ? labels.signInAction : labels.errors.contactSupport}
                      </ButtonLink>
                    </p>
                  ) : null}
                </Alert>
              </div>
            ) : Object.keys(errors).length > 0 ? (
              <Alert tone="danger" title={labels.errors.title}>
                {labels.errors.fixFields}
              </Alert>
            ) : null}

            <Button
              type="submit"
              size="lg"
              block
              loading={busy}
              disabled={!token}
              endIcon={<ArrowRight aria-hidden="true" />}
            >
              {busy ? labels.summary.continuing : labels.summary.continue}
            </Button>
            {!token && !busy ? <p className="-mt-2 text-center text-small text-ink-subtle">{labels.summary.waitingSecurity}</p> : null}
          </CardBody>
        </Card>
      </form>

      {needsDetails ? (
        <Drawer
          id={drawerId}
          eyebrow={labels.drawer.eyebrow}
          title={service.title}
          description={labels.drawer.description}
          footer={
            <>
              <DialogClose command="close" commandfor={drawerId}>
                {labels.drawer.cancel}
              </DialogClose>
              <Button type="submit" form={drawerFormId}>
                {labels.drawer.save}
              </Button>
            </>
          }
        >
          {/* method="dialog": a Save tapped before hydration only closes the drawer, instead of a GET to this URL that
              would drop `?service=` and put the IMEI in the address. After hydration saveDetails prevents it. */}
          <form id={drawerFormId} method="dialog" onSubmit={saveDetails} noValidate className="grid gap-5">
            <div className="flex items-center justify-between gap-4 rounded-card bg-surface-muted p-4">
              <div className="min-w-0">
                <p className="text-body font-semibold text-ink">{service.title}</p>
                <p className="text-small text-ink-subtle">{typeLabel}</p>
              </div>
              <div className="shrink-0 text-end">
                <Money amount={price.net} currency={price.currency} decimals={unitDecimals} className="text-body font-bold text-ink" />
                {mode.kind !== "single" ? <p className="text-small text-ink-subtle">{quantityLabels.perUnit}</p> : null}
              </div>
            </div>

            {service.isImei ? (
              <Input
                name="imei"
                label={labels.drawer.imei}
                hint={labels.drawer.imeiHint}
                error={errors.imei}
                value={imei}
                onChange={(event) => {
                  setImei(event.target.value);
                  clearError("imei");
                }}
                placeholder={labels.drawer.imeiPlaceholder}
                inputMode="numeric"
                autoComplete="off"
                maxLength={24}
                required
                dir="auto"
              />
            ) : null}

            {fields.map((field) => {
              const key = `inputs.${field.key}`;
              const common = {
                name: field.key,
                label: field.label,
                error: errors[key],
                required: field.required,
                optionalLabel: field.required ? undefined : labels.drawer.optional,
              };
              if (field.fieldType === "select") {
                return (
                  <Select
                    key={field.key}
                    {...common}
                    value={inputs[field.key] ?? ""}
                    onChange={(event) => setInput(field.key, event.target.value)}
                    placeholder={labels.drawer.select}
                    options={field.options.map((option) => ({ value: option, label: option }))}
                  />
                );
              }
              if (field.fieldType === "textarea") {
                return (
                  <Textarea
                    key={field.key}
                    {...common}
                    value={inputs[field.key] ?? ""}
                    maxLength={500}
                    onChange={(event) => setInput(field.key, event.target.value)}
                  />
                );
              }
              return (
                <Input
                  key={field.key}
                  {...common}
                  type={field.fieldType === "number" ? "number" : "text"}
                  inputMode={field.fieldType === "number" ? "decimal" : undefined}
                  value={inputs[field.key] ?? ""}
                  maxLength={500}
                  onChange={(event) => setInput(field.key, event.target.value)}
                />
              );
            })}

            <QuantityControl
              rule={rule}
              value={quantity}
              onChange={changeQuantity}
              error={errors.quantity}
              label={labels.drawer.quantity}
              hint={labels.drawer.quantityHint}
              placeholder={labels.drawer.select}
              quantityLabels={quantityLabels}
              stockHint={stockNote}
            />

            <Alert tone="info" title={labels.drawer.warningTitle}>
              {labels.drawer.warningText}
            </Alert>
          </form>
        </Drawer>
      ) : null}
    </>
  );
}
