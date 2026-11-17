"use client";
// Review and pay (`/checkout/<token>`): the locked amounts, the consents the session requires, the payment choices
// (the store balance first when the customer can use it, then the gateways the session offers) and "Pay". Flow
// (handoff §5.8):
// - gateway: POST …/consents (when something is new) → POST …/pay with one Idempotency-Key per attempt → send the browser
//   to the gateway's `paymentUrl`; the gateway sends it back to `/en/checkout/return?token=<token>`;
// - store balance (plan F30): POST …/consents → POST …/balance-payment with NO body, NO Content-Type and its own
//   Idempotency-Key (never one a `/pay` call used) → 201 means the order exists at once (no webhook): go to tracking.
//   A 401 or a 403 never signs anyone out here; the page says what to do instead.
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleCheck, Clock, Lock, ShieldCheck, Wallet } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { Money } from "@/components/ui/money";
import { PaymentMethodLogo } from "@/components/ui/payment-method-logo";
import { RadioCard, RadioGroup } from "@/components/ui/radio-card";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { createIdempotencyKeys } from "@/lib/api/idempotency";
import type { BalancePaymentResult, CheckoutSession, PayResult } from "@/lib/api/types";
import { formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import { fmt, plural } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import { sitePath } from "@/lib/site-path";
import type { CheckoutMessages } from "@/lib/i18n/messages/checkout";
import type { CommonMessages } from "@/lib/i18n/messages/common";
import { BALANCE_MAX_TRIES, balanceOption, balanceWaitMs, canPayFromBalance, showsBalanceChoice, type BalanceWallet } from "./balance-option";
import { Countdown } from "./countdown";
import { slot } from "./rich";

type Labels = CheckoutMessages["session"];
type Purpose = CheckoutSession["consent"]["required"][number];

export type SessionViewProps = {
  session: CheckoutSession;
  labels: Labels;
  /** `common.quantity`: the plural "Subtotal (N units)" label. */
  quantityLabels: CommonMessages["quantity"];
  typeLabel: string;
  /** Display decimals of the session's currency. */
  decimals: number;
  /** `/checkout?service=<slug>` of the service (null when it is no longer listed). */
  restartHref: string | null;
  countryName: string;
  /**
   * What the server read for this request (plan F30): whether a customer is signed in and their wallet (null when nobody
   * is signed in or the read failed). Only `balanceOption` turns it into what shows; the session's `balancePayable`
   * says whether the checkout itself may be paid from the balance.
   */
  balance: { signedIn: boolean; wallet: BalanceWallet | null };
};

/** Answers after which the wallet may look different: the page reads it again. */
const BALANCE_REFRESH_CODES = new Set(["INSUFFICIENT_FUNDS", "WALLET_FROZEN", "WALLET_DISABLED"]);

type PayError = { message: string; reference?: string; support?: boolean; link?: { href: string; label: string } };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Fills several `{name}` placeholders of a translated sentence with React nodes (amounts that must stay left-to-right). */
function fill(template: string, values: Record<string, ReactNode>): ReactNode {
  return template.split(/(\{\w+\})/g).map((part, index) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    return name !== undefined && name in values ? <Fragment key={index}>{values[name]}</Fragment> : part;
  });
}

export function SessionView({ session, labels, quantityLabels, typeLabel, decimals, restartHref, countryName, balance }: SessionViewProps) {
  const router = useRouter();
  const errorText = useErrorText();
  const p = (path: string) => sitePath(path);

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
  // Synchronous guard as well as the state: a second click must not start a second send before the state is applied.
  const inFlight = useRef(false);
  // Two key stores, never shared: a `/pay` call and the balance payment are different payments (plan D9, D13).
  const [payKeys] = useState(() => createIdempotencyKeys());
  const [balanceKeys] = useState(() => createIdempotencyKeys());
  const consentsSent = useRef<string>("");
  const refreshed = useRef(false);
  // False once the page is gone (the tracking page opened): a wait for IDEMPOTENCY_IN_PROGRESS then ends without a send.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The store balance: the server's facts decide the state; the first choice is the balance when it can pay.
  const option = balanceOption({
    balancePayable: session.balancePayable,
    usdGross: session.amounts.usd.gross,
    signedIn: balance.signedIn,
    wallet: balance.wallet,
  });
  const [payWith, setPayWith] = useState<"balance" | "gateway">(() => (canPayFromBalance(option) ? "balance" : "gateway"));
  // Derived, so a wallet that stops being ready after a refresh (on hold, spent elsewhere) falls back to the gateways.
  const viaBalance = payWith === "balance" && canPayFromBalance(option);
  const canSubmit = viaBalance || session.paymentMethods.length > 0;

  // The clock is a leaf (<Countdown>), so only its text re-renders every second (plan P4.3). This page hears once, at zero.
  const [timedOut, setTimedOut] = useState(false);
  const expired = session.status === "expired" || (session.status === "open" && timedOut);
  function onExpire() {
    setTimedOut(true);
    if (refreshed.current) return;
    refreshed.current = true;
    // The server reads the session as expired from now on: reload so the page and the server agree.
    router.refresh();
  }

  // Focus goes to the error after React has committed the box (it does not exist before): the Pay button is disabled
  // while it loads, so it has dropped focus by then. Each failure sets a new error object, so a retry focuses again.
  const errorBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorBox.current?.focus();
  }, [error]);

  const display = session.amounts.display;
  const money = (amount: string) => <Money amount={amount} currency={session.currency} decimals={decimals} />;
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
  const signInHref = `${p("/sign-in")}?as=customer&next=${encodeURIComponent(p(`/checkout/${encodeURIComponent(session.token)}`))}`;
  /** A new checkout of the same service and quantity (the form checks the quantity against today's rule). */
  const reopenHref = restartHref ?? p("/services");

  function describe(failure: unknown): { error: PayError; gatewayText?: string; consentText?: string } {
    const reference = errorText.reference(failure);
    if (!isApiError(failure)) return { error: { message: errorText.message(failure), reference } };
    if (viaBalance) {
      // Answers only the balance payment has. None of them ends the session: the customer stays signed in.
      if (failure.status === 401) {
        return { error: { message: labels.errors.signInRequired, reference, link: { href: signInHref, label: labels.balance.signInAction } } };
      }
      if (failure.status === 403 && failure.code === "FORBIDDEN") {
        return { error: { message: labels.errors.forbidden, reference, link: { href: reopenHref, label: labels.balance.reopenAction } } };
      }
      if (failure.code === "INSUFFICIENT_FUNDS") {
        return {
          error: {
            message: labels.errors.insufficient,
            reference,
            link: { href: p("/account/wallet/add-funds"), label: labels.balance.addFunds },
          },
        };
      }
    }
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
      const until = typeof failure.extensions.expectedEndAt === "string" ? formatDateTime(failure.extensions.expectedEndAt) : "";
      return { error: { message: `${labels.errors.maintenance}${until ? ` ${fmt(labels.errors.maintenanceUntil, { time: until })}` : ""}`, reference } };
    }
    return { error: { message: errorText.message(failure), reference } };
  }

  /** `POST …/consents` for what is new (once per set of grants). */
  async function grantConsents() {
    const grants = [
      ...required.filter((purpose) => !alreadyGranted.has(purpose)).map((purpose) => ({ purpose, granted: true })),
      ...(marketing ? [{ purpose: "marketing" as const, granted: true }] : []),
    ];
    const signature = JSON.stringify(grants);
    if (grants.length > 0 && consentsSent.current !== signature) {
      await api.post(`/store/v1/checkout-sessions/${encodeURIComponent(session.token)}/consents`, { consents: grants });
      consentsSent.current = signature;
    }
  }

  /** `POST …/pay`, then the browser leaves for the gateway. One key per request (same gateway and return address). */
  async function payWithGateway() {
    const returnUrl = `${window.location.origin}${p("/checkout/return")}?token=${encodeURIComponent(session.token)}`;
    const body = { gateway, returnUrl };
    try {
      const result = await api.post<PayResult>(`/store/v1/checkout-sessions/${encodeURIComponent(session.token)}/pay`, body, {
        idempotencyKey: payKeys.keyFor(JSON.stringify(body)),
      });
      payKeys.reset();
      window.location.assign(result.paymentUrl);
    } catch (failure) {
      // The key met another body (never meant to happen): forget it, so the next press starts a new payment.
      if (isApiError(failure) && failure.code === "IDEMPOTENCY_KEY_REUSED") payKeys.reset();
      throw failure;
    }
  }

  /**
   * `POST …/balance-payment`: no body, no Content-Type, the store CSRF token of the signed-in customer and the key of
   * this checkout. A double click and a retry send the same key (one payment); a success forgets it. The order exists
   * when the answer is 201, so the browser goes to tracking.
   * - `409 IDEMPOTENCY_KEY_REUSED`: the key is forgotten and the request is sent once more with a new one.
   * - `409 IDEMPOTENCY_IN_PROGRESS`: the first send still runs; wait `Retry-After` and send the same request again, at
   *   most `BALANCE_MAX_TRIES` sends in all. Then the error is shown and the next press sends the same key again.
   */
  async function payFromBalance() {
    const path = `/store/v1/checkout-sessions/${encodeURIComponent(session.token)}/balance-payment`;
    const signature = `balance:${session.token}`;
    let renewed = false;
    for (let tries = 1; ; ) {
      try {
        const result = await api.post<BalancePaymentResult>(path, undefined, { idempotencyKey: balanceKeys.keyFor(signature) });
        balanceKeys.reset();
        const tracking = result?.order?.trackingToken;
        // Paid but unreadable answer: the session now says paid, so reading it again shows where to go.
        if (!tracking) router.refresh();
        else router.replace(p(`/track/${encodeURIComponent(tracking)}`));
        return;
      } catch (failure) {
        if (isApiError(failure) && failure.code === "IDEMPOTENCY_KEY_REUSED") {
          balanceKeys.reset();
          if (!renewed) {
            renewed = true;
            continue;
          }
        }
        if (isApiError(failure) && failure.code === "IDEMPOTENCY_IN_PROGRESS" && tries < BALANCE_MAX_TRIES) {
          tries += 1;
          await sleep(balanceWaitMs(failure.retryAfter));
          if (!alive.current) return;
          continue;
        }
        throw failure;
      }
    }
  }

  async function pay() {
    if (inFlight.current) return;
    setError(undefined);
    setGatewayError(undefined);
    const missing: Partial<Record<Purpose, string>> = {};
    for (const purpose of required) if (!checked[purpose]) missing[purpose] = labels.consent.required;
    setConsentErrors(missing);
    if (Object.keys(missing).length > 0 || (!viaBalance && !gateway)) {
      if (!viaBalance && !gateway) setGatewayError(labels.methods.required);
      setTimeout(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus(), 50);
      return;
    }

    inFlight.current = true;
    setBusy(true);
    try {
      await grantConsents();
      if (viaBalance) {
        await payFromBalance();
      } else {
        await payWithGateway();
      }
      return; // leave the page busy while the browser navigates
    } catch (failure) {
      const { error: shown, gatewayText, consentText } = describe(failure);
      setError(shown);
      if (gatewayText) setGatewayError(gatewayText);
      if (consentText) setConsentErrors(Object.fromEntries(required.map((purpose) => [purpose, consentText])));
      // The session or the wallet changed under the page: read both again, so the choice redraws from the truth.
      if (isApiError(failure) && (failure.code === "INVALID_TRANSITION" || (viaBalance && BALANCE_REFRESH_CODES.has(failure.code)))) {
        router.refresh();
      }
    }
    inFlight.current = false;
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

  // The line under "Available": why the choice is off, or what it takes from the balance when the checkout is not in USD.
  // One node (or null), so the card draws no empty block.
  const usd = (amount: string) => <Money amount={amount} currency="USD" />;
  let balanceNote: ReactNode = null;
  if (option.kind === "frozen") balanceNote = labels.balance.frozen;
  else if (option.kind === "insufficient") balanceNote = fill(labels.balance.insufficient, { available: usd(option.available), total: usd(option.total) });
  else if (option.kind === "ready" && session.currency !== "USD") balanceNote = slot(labels.balance.takesUsd, "amount", usd(option.total));

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
                <span className="num">{formatNumber(session.quantity)}</span>
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
          <CardHeader
            title={labels.methods.title}
            description={showsBalanceChoice(option) ? labels.balance.methodsDescription : labels.methods.description}
          />
          <CardBody className="grid gap-4">
            {option.kind === "sign-in" ? (
              <Alert tone="info" icon={<Wallet aria-hidden="true" />} title={labels.balance.title}>
                <p>{labels.balance.signIn}</p>
                <p className="mt-2">
                  <ButtonLink href={signInHref} variant="secondary" size="sm">
                    {labels.balance.signInAction}
                  </ButtonLink>
                </p>
              </Alert>
            ) : null}
            {option.kind === "reopen" ? (
              <Alert tone="info" icon={<Wallet aria-hidden="true" />} title={labels.balance.title}>
                <p>{labels.balance.reopen}</p>
                <p className="mt-2">
                  <ButtonLink href={reopenHref} variant="secondary" size="sm">
                    {labels.balance.reopenAction}
                  </ButtonLink>
                </p>
              </Alert>
            ) : null}
            {!showsBalanceChoice(option) && session.paymentMethods.length === 0 ? (
              <Alert tone="warning">{labels.methods.none}</Alert>
            ) : (
              <RadioGroup legend={labels.methods.title} legendHidden error={gatewayError} columns={2}>
                {showsBalanceChoice(option) ? (
                  <RadioCard
                    name="gateway"
                    value="balance"
                    checked={viaBalance}
                    disabled={option.kind !== "ready"}
                    onChange={() => {
                      setPayWith("balance");
                      setGatewayError(undefined);
                    }}
                    icon={<Wallet aria-hidden="true" />}
                    title={labels.balance.title}
                    description={slot(labels.balance.available, "amount", usd(option.available))}
                    tone="inverse"
                    cardClassName="sm:col-span-2"
                  >
                    {balanceNote}
                  </RadioCard>
                ) : null}
                {session.paymentMethods.map((method) => (
                  <RadioCard
                    key={method.code}
                    name="gateway"
                    value={method.code}
                    checked={!viaBalance && gateway === method.code}
                    onChange={() => {
                      setPayWith("gateway");
                      setGateway(method.code);
                      setGatewayError(undefined);
                    }}
                    icon={<PaymentMethodLogo name={method.name} alt="" logoUrl={method.logoUrl} preset={method.preset} code={method.code} />}
                    title={method.name}
                    description={methodDescription(method.code, method.supports3ds)}
                  />
                ))}
              </RadioGroup>
            )}
            {option.kind === "insufficient" ? (
              <p>
                <ButtonLink href={p("/account/wallet/add-funds")} variant="secondary" size="sm">
                  {labels.balance.addFunds}
                </ButtonLink>
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-6">
        <CardHeader title={labels.summary.title} />
        <CardBody className="grid gap-4">
          <p className="flex items-center gap-2 rounded-control bg-surface-muted px-3 py-2.5 text-small font-semibold text-ink" aria-label={labels.timerLabel}>
            <Clock aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
            <Countdown expiresAt={session.expiresAt} onExpire={onExpire} template={labels.timer} />
          </p>
          <DescriptionList>
            {/* The session's own totals: the net of all units, then the tax worked once on it. */}
            <DescriptionItem label={plural(session.quantity, quantityLabels.subtotal, formatNumber(session.quantity))}>
              {money(display.net)}
            </DescriptionItem>
            <DescriptionItem
              label={taxApplies ? fmt(labels.summary.tax, { rate: formatPercent(session.taxRate) }) : labels.summary.taxNone}
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
            <div id="pay-error" ref={errorBox} tabIndex={-1} className="outline-none">
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
                {error.link ? (
                  <p className="mt-2">
                    <ButtonLink href={error.link.href} variant="secondary" size="sm">
                      {error.link.label}
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
            disabled={!canSubmit}
            onClick={pay}
            endIcon={<ArrowRight aria-hidden="true" />}
          >
            {busy
              ? viaBalance
                ? labels.balance.paying
                : labels.summary.paying
              : slot(labels.summary.pay, "amount", <Money amount={display.gross} currency={session.currency} decimals={decimals} />)}
          </Button>
          {/* The provider-page line is false for a balance payment: no provider page opens. */}
          {viaBalance ? null : (
            <p className="flex items-start gap-2 text-small text-ink-subtle">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {labels.summary.secure}
            </p>
          )}
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
