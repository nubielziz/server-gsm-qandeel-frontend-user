"use client";
// Review and pay (`/checkout/<token>`): the locked amounts, the consents the session requires, the payment methods the
// session offers and "Pay". Flow (handoff §5.8): POST …/consents (when something is new) → POST …/pay with one
// Idempotency-Key per attempt → send the browser to the gateway's `paymentUrl`. The gateway sends it back to
// `/<lang>/checkout/return?token=<token>`.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Banknote, Bitcoin, CircleCheck, Clock, CreditCard, Lock, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { Money } from "@/components/ui/money";
import { RadioCard, RadioGroup } from "@/components/ui/radio-card";
import { api, newIdempotencyKey } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import type { CheckoutSession, PayResult } from "@/lib/api/types";
import { formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import { localePath, type Locale } from "@/lib/i18n/config";
import type { CheckoutMessages } from "@/lib/i18n/messages/checkout";
import { slot } from "./rich";

type Labels = CheckoutMessages["session"];
type Purpose = CheckoutSession["consent"]["required"][number];

export type SessionViewProps = {
  session: CheckoutSession;
  locale: Locale;
  labels: Labels;
  typeLabel: string;
  /** Display decimals of the session's currency. */
  decimals: number;
  /** `/checkout?service=<slug>` of the service (null when it is no longer listed). */
  restartHref: string | null;
  countryName: string;
};

// ── A clock that ticks once a second for every subscriber (no setState in effects, no drift between components).
let nowSeconds = Math.floor(Date.now() / 1000);
const tickListeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | undefined;
function subscribeTick(listener: () => void) {
  tickListeners.add(listener);
  nowSeconds = Math.floor(Date.now() / 1000);
  tickTimer ??= setInterval(() => {
    nowSeconds = Math.floor(Date.now() / 1000);
    tickListeners.forEach((l) => l());
  }, 1000);
  return () => {
    tickListeners.delete(listener);
    if (tickListeners.size === 0 && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = undefined;
    }
  };
}
const useNowSeconds = () => useSyncExternalStore(subscribeTick, () => nowSeconds, () => null);

function clock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function methodIcon(code: string) {
  if (/crypto|usdt|btc/i.test(code)) return <Bitcoin aria-hidden="true" />;
  if (/card|stripe|visa/i.test(code)) return <CreditCard aria-hidden="true" />;
  return <Banknote aria-hidden="true" />;
}

type PayError = { message: string; reference?: string; support?: boolean };

export function SessionView({ session, locale, labels, typeLabel, decimals, restartHref, countryName }: SessionViewProps) {
  const router = useRouter();
  const errorText = useErrorText();
  const p = (path: string) => localePath(locale, path);

  const required = session.consent.required;
  const alreadyGranted = new Set<Purpose>(session.consent.granted);
  const [checked, setChecked] = useState<Partial<Record<Purpose, boolean>>>(() =>
    Object.fromEntries(session.consent.granted.map((purpose) => [purpose, true])),
  );
  const [marketing, setMarketing] = useState(false);
  const [consentErrors, setConsentErrors] = useState<Partial<Record<Purpose, string>>>({});
  const [gateway, setGateway] = useState(session.paymentMethods[0]?.code ?? "");
  const [gatewayError, setGatewayError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PayError>();
  const attempt = useRef<{ gateway: string; key: string } | null>(null);
  const consentsSent = useRef<string>("");
  const refreshed = useRef(false);

  const now = useNowSeconds();
  const secondsLeft = now === null ? null : Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - now * 1000) / 1000));
  const expired = session.status === "expired" || (session.status === "open" && secondsLeft === 0);
  const timedOut = session.status === "open" && secondsLeft === 0;
  useEffect(() => {
    if (!timedOut || refreshed.current) return;
    refreshed.current = true;
    // The server reads the session as expired from now on: reload so the page and the server agree.
    router.refresh();
  }, [timedOut, router]);

  const display = session.amounts.display;
  const money = (amount: string) => <Money amount={amount} currency={session.currency} locale={locale} decimals={decimals} />;
  const taxApplies = /[1-9]/.test(display.tax);

  // ── Paid / expired
  if (session.status === "paid") {
    return (
      <Alert
        tone="success"
        icon={<CircleCheck aria-hidden="true" />}
        title={labels.paidTitle}
        action={
          session.trackingToken ? (
            <ButtonLink href={p(`/track/${encodeURIComponent(session.trackingToken)}`)} size="sm">
              {labels.paidAction}
            </ButtonLink>
          ) : (
            <ButtonLink href={`${p("/checkout/return")}?token=${encodeURIComponent(session.token)}`} size="sm" variant="secondary">
              {labels.paidPendingAction}
            </ButtonLink>
          )
        }
      >
        {session.trackingToken ? labels.paidText : labels.paidPendingText}
      </Alert>
    );
  }
  if (expired) {
    return (
      <Alert
        tone="warning"
        title={labels.expiredTitle}
        action={
          restartHref ? (
            <ButtonLink href={restartHref} size="sm">
              {labels.expiredAction}
            </ButtonLink>
          ) : (
            <ButtonLink href={p("/services")} size="sm" variant="secondary">
              {labels.notFoundAction}
            </ButtonLink>
          )
        }
      >
        {labels.expiredText}
      </Alert>
    );
  }

  // ── Open: pay
  function describe(failure: unknown): { error: PayError; gatewayText?: string; consentText?: string } {
    const reference = errorText.reference(failure);
    if (!isApiError(failure)) return { error: { message: errorText.message(failure), reference } };
    const gatewayField = failure.fieldError("gateway");
    if (failure.status === 422 && gatewayField) {
      const text = gatewayField.code === "out_of_range" ? labels.errors.outOfRange : labels.errors.notOffered;
      return { error: { message: text, reference }, gatewayText: text };
    }
    if (failure.status === 422 && failure.fieldError("consent")) {
      return { error: { message: labels.errors.consent, reference }, consentText: labels.errors.consent };
    }
    if (failure.code === "INVALID_TRANSITION") return { error: { message: labels.errors.transition, reference } };
    if (failure.code === "ACCOUNT_SUSPENDED") return { error: { message: labels.errors.suspended, reference, support: true } };
    if (failure.code === "GATEWAY_ERROR") return { error: { message: labels.errors.gateway, reference } };
    if (failure.code === "MAINTENANCE") {
      const until = typeof failure.extensions.expectedEndAt === "string" ? formatDateTime(failure.extensions.expectedEndAt, locale) : "";
      return { error: { message: `${labels.errors.maintenance}${until ? ` ${fmt(labels.errors.maintenanceUntil, { time: until })}` : ""}`, reference } };
    }
    return { error: { message: errorText.message(failure), reference } };
  }

  async function pay() {
    if (busy) return;
    setError(undefined);
    setGatewayError(undefined);
    const missing: Partial<Record<Purpose, string>> = {};
    for (const purpose of required) if (!checked[purpose]) missing[purpose] = labels.consent.required;
    setConsentErrors(missing);
    if (Object.keys(missing).length > 0 || !gateway) {
      if (!gateway) setGatewayError(labels.methods.required);
      setTimeout(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus(), 50);
      return;
    }

    setBusy(true);
    try {
      const grants = [
        ...required.filter((purpose) => !alreadyGranted.has(purpose)).map((purpose) => ({ purpose, granted: true })),
        ...(marketing ? [{ purpose: "marketing" as const, granted: true }] : []),
      ];
      const signature = JSON.stringify(grants);
      if (grants.length > 0 && consentsSent.current !== signature) {
        await api.post(`/store/v1/checkout-sessions/${encodeURIComponent(session.token)}/consents`, { consents: grants, locale });
        consentsSent.current = signature;
      }
      // One Idempotency-Key per attempt: a retry of the same payment reuses it; another gateway is another payment.
      if (!attempt.current || attempt.current.gateway !== gateway) attempt.current = { gateway, key: newIdempotencyKey() };
      const returnUrl = `${window.location.origin}${p("/checkout/return")}?token=${encodeURIComponent(session.token)}`;
      const result = await api.post<PayResult>(
        `/store/v1/checkout-sessions/${encodeURIComponent(session.token)}/pay`,
        { gateway, returnUrl },
        { idempotencyKey: attempt.current.key },
      );
      window.location.assign(result.paymentUrl);
      return; // leave the page busy while the browser navigates
    } catch (failure) {
      const { error: shown, gatewayText, consentText } = describe(failure);
      setError(shown);
      if (gatewayText) setGatewayError(gatewayText);
      if (consentText) setConsentErrors(Object.fromEntries(required.map((purpose) => [purpose, consentText])));
      if (isApiError(failure) && failure.code === "INVALID_TRANSITION") router.refresh();
      document.getElementById("pay-error")?.focus();
    }
    setBusy(false);
  }

  const termsLink = (href: string, text: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-4">
      {text}
      <span className="sr-only"> ({labels.consent.newTab})</span>
    </a>
  );

  function consentLabel(purpose: Purpose) {
    switch (purpose) {
      case "terms":
        return { label: slot(labels.consent.terms, "link", termsLink(p("/pages/terms"), labels.consent.termsLink)) };
      case "privacy":
        return { label: slot(labels.consent.privacy, "link", termsLink(p("/pages/privacy"), labels.consent.privacyLink)) };
      case "refund_policy":
        return { label: slot(labels.consent.refund, "link", termsLink(p("/pages/refund"), labels.consent.refundLink)) };
      case "withdrawal_waiver":
        return {
          label: labels.consent.withdrawal,
          description: slot(labels.consent.withdrawalHint, "link", termsLink(p("/pages/refund"), labels.consent.refundLink)),
        };
      default:
        return { label: labels.consent.marketing };
    }
  }

  const methodDescription = (code: string, supports3ds: boolean) => {
    const text = /crypto|usdt|btc/i.test(code) ? labels.methods.crypto : /card|stripe|visa/i.test(code) ? labels.methods.card : "";
    if (!text && !supports3ds) return undefined;
    return (
      <>
        {text}
        {text && supports3ds ? " · " : null}
        {supports3ds ? slot(labels.methods.threeDs, "name", <bdi>3-D Secure</bdi>) : null}
      </>
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="grid min-w-0 gap-6">
        <Card>
          <CardHeader
            title={session.service.name}
            description={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Badge tone="outline" shape="tag">
                  {typeLabel}
                </Badge>
              </span>
            }
          />
          <CardBody>
            <DescriptionList>
              <DescriptionItem label={labels.order.quantity}>
                <span className="num">{formatNumber(session.quantity, locale)}</span>
              </DescriptionItem>
              {session.imei ? (
                <DescriptionItem label={labels.order.imei}>
                  <span className="num" dir="ltr">
                    {session.imei}
                  </span>
                </DescriptionItem>
              ) : null}
              <DescriptionItem label={labels.order.email}>
                <span dir="ltr">{session.email}</span>
              </DescriptionItem>
              {session.country ? <DescriptionItem label={labels.order.country}>{countryName}</DescriptionItem> : null}
              <DescriptionItem label={labels.order.delivery}>
                <bdi>{session.service.deliveryTime}</bdi>
              </DescriptionItem>
            </DescriptionList>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={labels.consent.title} description={labels.consent.description} />
          <CardBody className="grid gap-1">
            {required.map((purpose) => {
              const { label, description } = consentLabel(purpose);
              return (
                <Checkbox
                  key={purpose}
                  name={purpose}
                  checked={Boolean(checked[purpose])}
                  onChange={(event) => {
                    setChecked((prev) => ({ ...prev, [purpose]: event.target.checked }));
                    setConsentErrors((prev) => ({ ...prev, [purpose]: undefined }));
                  }}
                  label={label}
                  description={description}
                  error={consentErrors[purpose]}
                />
              );
            })}
            {!required.includes("marketing") ? (
              <Checkbox name="marketing" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} label={labels.consent.marketing} />
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={labels.methods.title} description={labels.methods.description} />
          <CardBody>
            {session.paymentMethods.length === 0 ? (
              <Alert tone="warning">{labels.methods.none}</Alert>
            ) : (
              <RadioGroup legend={labels.methods.title} legendHidden error={gatewayError} columns={2}>
                {session.paymentMethods.map((method) => (
                  <RadioCard
                    key={method.code}
                    name="gateway"
                    value={method.code}
                    checked={gateway === method.code}
                    onChange={() => {
                      setGateway(method.code);
                      setGatewayError(undefined);
                    }}
                    icon={methodIcon(method.code)}
                    title={method.name}
                    description={methodDescription(method.code, method.supports3ds)}
                  />
                ))}
              </RadioGroup>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-6">
        <CardHeader title={labels.summary.title} />
        <CardBody className="grid gap-4">
          <p className="flex items-center gap-2 rounded-control bg-surface-muted px-3 py-2.5 text-small font-semibold text-ink" aria-label={labels.timerLabel}>
            <Clock aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
            <span>
              {fmt(labels.timer, { time: secondsLeft === null ? "--:--" : clock(secondsLeft) })}
            </span>
          </p>
          <DescriptionList>
            <DescriptionItem label={labels.summary.net}>{money(display.net)}</DescriptionItem>
            <DescriptionItem
              label={taxApplies ? fmt(labels.summary.tax, { rate: formatPercent(session.taxRate, locale) }) : labels.summary.taxNone}
            >
              {taxApplies ? money(display.tax) : money("0.0000")}
            </DescriptionItem>
            <DescriptionItem label={labels.summary.total} emphasis>
              {money(display.gross)}
            </DescriptionItem>
          </DescriptionList>
          <p className="flex items-start gap-2 text-small text-ink-subtle">
            <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {labels.summary.locked}
              {session.currency !== "USD" ? (
                <>
                  {" "}
                  <bdi className="num">{fmt(labels.summary.fx, { rate: session.fxRate.replace(/0+$/, "").replace(/\.$/, ""), currency: session.currency })}</bdi>
                </>
              ) : null}
            </span>
          </p>

          {error ? (
            <div id="pay-error" tabIndex={-1} className="outline-none">
              <Alert tone="danger" title={labels.errors.title}>
                <p>{error.message}</p>
                {error.reference ? <p dir="ltr" className="mt-1 text-small num">{error.reference}</p> : null}
                {error.support ? (
                  <p className="mt-2">
                    <ButtonLink href={p("/support")} variant="secondary" size="sm">
                      {labels.errors.contactSupport}
                    </ButtonLink>
                  </p>
                ) : null}
              </Alert>
            </div>
          ) : null}

          <Button
            size="lg"
            block
            loading={busy}
            disabled={session.paymentMethods.length === 0}
            onClick={pay}
            endIcon={<ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />}
          >
            {busy
              ? labels.summary.paying
              : slot(labels.summary.pay, "amount", <Money amount={display.gross} currency={session.currency} locale={locale} decimals={decimals} />)}
          </Button>
          <p className="flex items-start gap-2 text-small text-ink-subtle">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {labels.summary.secure}
          </p>
          <p className="text-center">
            <Link href={p("/support")} className="touch-target inline-flex text-small font-semibold text-ink underline underline-offset-4">
              {labels.errors.contactSupport}
            </Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
