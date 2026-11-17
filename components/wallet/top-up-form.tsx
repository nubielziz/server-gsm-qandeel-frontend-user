"use client";
// The Add funds form (plan F33, BH §3.3): pick a method, type an amount, see the fee and what the wallet receives, then
// create the top-up with `POST /store/v1/me/wallet/top-ups`. A manual method goes on to the top-up page (instructions and
// the receipt upload); an automatic one sends the browser to `paymentUrl` (http or https only).
// Before any request the form checks what the API would refuse (method and wallet limits, the room left, the 24-hour
// limits, a fee that eats the amount: lib/wallet/top-up-errors.ts), because the route's limiter counts refusals too.
// The request carries an `Idempotency-Key` from `createIdempotencyKeys`: the same key for the same amount and method (a
// double click, a retry), a new one when either changes, forgotten after a success and after 409 IDEMPOTENCY_KEY_REUSED.
// A signed-out answer refreshes the route (the account layout then asks to sign in); every other refusal is shown, never
// a sign-out.
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { api, forgetCsrf } from "@/lib/api/browser";
import { createIdempotencyKeys } from "@/lib/api/idempotency";
import type { TopUpDetail, TopUpMethod } from "@/lib/api/types";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import type { TopUpsMessages } from "@/lib/i18n/messages/top-ups";
import { isHttpUrl, ltr } from "@/lib/merchant/format";
import { isSignedOutError } from "@/lib/merchant/signed-out";
import { parseAmountInput } from "@/lib/merchant/money-math";
import {
  amountProblemText,
  effectiveLimits,
  estimateNet,
  estimateTopUpFee,
  isNoLimit,
  topUpAmountProblem,
  topUpErrorText,
  type TopUpLimits,
} from "@/lib/wallet/top-up-errors";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { PaymentMethodLogo } from "@/components/ui/payment-method-logo";
import { RadioCard, RadioGroup } from "@/components/ui/radio-card";
import { toast } from "@/components/ui/toast";

const CREATE_PATH = "/store/v1/me/wallet/top-ups";
const METHODS_ID = "topup-methods";
const AMOUNT_ID = "topup-amount";

export type TopUpFormProps = {
  methods: TopUpMethod[];
  /** `GET /store/v1/me/wallet` `limits`. */
  limits: TopUpLimits;
  /** The balance is on hold: an online method would be refused (a bank transfer still works), so it is not offered. */
  frozen: boolean;
  /** `/en/account/wallet/top-ups`: the page of a new top-up is `${detailBase}/${id}`. */
  detailBase: string;
  labels: TopUpsMessages["form"];
  errors: TopUpsMessages["errors"];
};

export function TopUpForm({ methods, limits, frozen, detailBase, labels: t, errors }: TopUpFormProps) {
  const router = useRouter();
  const errorText = useErrorText();
  const [keys] = useState(() => createIdempotencyKeys());
  const inFlight = useRef(false);
  const errorBox = useRef<HTMLDivElement>(null);

  const offered = (m: TopUpMethod) => !(frozen && m.kind === "automatic");
  const usable = methods.filter(offered);
  const [methodId, setMethodId] = useState<number | null>(usable.length === 1 ? usable[0].id : null);
  const [amountText, setAmountText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [formError, setFormError] = useState<{ message: string; reference?: string; viewHref?: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ amount?: string; gatewayId?: string }>({});

  const method = methods.find((m) => m.id === methodId) ?? null;
  const amount = parseAmountInput(amountText);
  const problem = topUpAmountProblem({ amount, method, limits });
  const textContext = { t: errors, method, limits };
  const localAmountError = problem ? amountProblemText(problem, textContext) : undefined;
  const ready = Boolean(amount && method && !problem);
  const fee = ready && amount && method ? estimateTopUpFee(amount, method) : null;
  const net = ready && amount && method ? estimateNet(amount, method) : null;
  // Only after a submit: a message appearing while typing would push the button down between press and release of a tap.
  const shownAmountError = fieldErrors.amount ?? (submitted ? localAmountError : undefined);
  const methodError = fieldErrors.gatewayId ?? (submitted && !method ? t.chooseMethod : undefined);
  const chosen = effectiveLimits(method, limits);

  const usd = (value: string) => ltr(formatMoney(value, "USD"));

  function feeText(m: TopUpMethod): string {
    const percent = !isNoLimit(m.feePercent);
    const fixed = !isNoLimit(m.feeFixed);
    const fixedText = usd(m.feeFixed);
    if (percent && fixed) return fmt(t.feeBoth, { percent: ltr(formatPercent(m.feePercent)), fixed: fixedText });
    if (percent) return fmt(t.feePercent, { percent: ltr(formatPercent(m.feePercent)) });
    if (fixed) return fmt(t.feeFixed, { fixed: fixedText });
    return t.feeNone;
  }

  function limitText(min: string | null, max: string | null): string {
    if (min && max) return fmt(t.limits, { min: usd(min), max: usd(max) });
    if (min) return fmt(t.limitMin, { min: usd(min) });
    if (max) return fmt(t.limitMax, { max: usd(max) });
    return t.limitNone;
  }

  function perTopUpText(min: string | null, max: string | null): string {
    if (min && max) return fmt(t.limitRange, { min: usd(min), max: usd(max) });
    if (min) return fmt(t.limitFrom, { min: usd(min) });
    if (max) return fmt(t.limitUpTo, { max: usd(max) });
    return t.limitAny;
  }

  function showError(message: string, reference?: string, viewHref?: string) {
    setFormError({ message, reference, viewHref });
    requestAnimationFrame(() => errorBox.current?.focus());
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A ref, not state: a second click can arrive before React has re-rendered the disabled button.
    if (inFlight.current) return;
    setSubmitted(true);
    setFormError(null);
    setFieldErrors({});
    if (!method) {
      document.getElementById(METHODS_ID)?.focus();
      return;
    }
    if (problem || !amount) {
      document.getElementById(AMOUNT_ID)?.focus();
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    try {
      const created = await api.post<TopUpDetail>(
        CREATE_PATH,
        { amount, gatewayId: method.id },
        { idempotencyKey: keys.keyFor(JSON.stringify([amount, method.id])) },
      );
      keys.reset();
      const detailHref = `${detailBase}/${created.id}`;
      if (created.paymentUrl) {
        if (!isHttpUrl(created.paymentUrl)) {
          inFlight.current = false;
          setSubmitting(false);
          showError(t.invalidPaymentUrl, undefined, detailHref);
          return;
        }
        setRedirecting(true);
        window.location.assign(created.paymentUrl);
        return; // stay disabled: the browser is leaving the page
      }
      toast.success(fmt(t.created, { number: ltr(created.number) }));
      router.push(detailHref);
      router.refresh();
    } catch (error) {
      inFlight.current = false;
      setSubmitting(false);
      if (isSignedOutError(error)) {
        forgetCsrf("store");
        router.refresh();
        return;
      }
      const result = topUpErrorText(error, { action: "create", generic: errorText, t: errors, method, limits });
      if (result.forgetKey) keys.reset();
      if (result.field === "amount" || result.field === "gatewayId") {
        const field = result.field;
        setFieldErrors({ [field]: result.text });
        requestAnimationFrame(() => document.getElementById(field === "gatewayId" ? METHODS_ID : AMOUNT_ID)?.focus());
        return;
      }
      showError(result.text, errorText.reference(error));
    }
  }

  const note = redirecting ? t.redirecting : !method ? t.notePick : method.kind === "manual" ? t.noteManual : t.noteAutomatic;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-busy={submitting || undefined}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start"
    >
      <div className="grid min-w-0 gap-6">
        <div ref={errorBox} tabIndex={-1} className="empty:hidden focus:outline-none">
          {formError ? (
            <Alert
              tone="danger"
              action={
                formError.viewHref ? (
                  <ButtonLink href={formError.viewHref} variant="secondary" size="sm">
                    {t.viewTopUp}
                  </ButtonLink>
                ) : undefined
              }
            >
              {formError.message}
              {formError.reference ? <span className="num mt-1 block text-small">{formError.reference}</span> : null}
            </Alert>
          ) : null}
        </div>

        <Card>
          <CardBody className="grid gap-6">
            <div id={METHODS_ID} tabIndex={-1} className="focus:outline-none">
              <RadioGroup legend={t.methodLegend} required columns={2} error={methodError}>
                {methods.map((m) => {
                  const unavailable = !offered(m);
                  const own = effectiveLimits(m, limits);
                  return (
                    <RadioCard
                      key={m.id}
                      name="gatewayId"
                      value={m.id}
                      checked={methodId === m.id}
                      disabled={unavailable}
                      onChange={() => {
                        setMethodId(m.id);
                        setFieldErrors((prev) => ({ ...prev, gatewayId: undefined }));
                      }}
                      icon={<PaymentMethodLogo name={m.name} alt="" logoUrl={m.logoUrl} preset={m.preset} methodType={m.methodType} />}
                      title={<span dir="auto">{m.name}</span>}
                      trailing={<Badge tone={m.kind === "manual" ? "neutral" : "success"}>{m.kind === "manual" ? t.manual : t.automatic}</Badge>}
                    >
                      <span className="grid gap-0.5 text-small text-ink-subtle">
                        <span>{feeText(m)}</span>
                        <span>{limitText(own.min, own.max)}</span>
                        {m.holdHours > 0 ? <span>{fmt(t.hold, { hours: formatNumber(m.holdHours) })}</span> : null}
                        {unavailable ? <span className="font-medium text-warning-ink">{t.frozenMethod}</span> : null}
                      </span>
                    </RadioCard>
                  );
                })}
              </RadioGroup>
            </div>

            <Input
              id={AMOUNT_ID}
              name="amount"
              label={t.amount}
              required
              inputMode="decimal"
              autoComplete="off"
              dir="ltr"
              value={amountText}
              onChange={(event) => {
                setAmountText(event.target.value);
                setFieldErrors((prev) => ({ ...prev, amount: undefined }));
              }}
              leading={
                <span aria-hidden="true" className="text-body font-semibold">
                  $
                </span>
              }
              hint={t.amountHint}
              error={shownAmountError}
              fieldClassName="sm:max-w-sm"
            />
          </CardBody>
        </Card>

        <Card tone="muted">
          <CardHeader title={t.limitsTitle} />
          <CardBody>
            <DescriptionList>
              <DescriptionItem label={t.limitPerTopUp}>{perTopUpText(chosen.min, chosen.max)}</DescriptionItem>
              <DescriptionItem label={t.limitRoom}>
                <Money amount={limits.room} currency="USD" />
              </DescriptionItem>
              <DescriptionItem label={t.limitCount}>{formatNumber(limits.topUpsLeftToday)}</DescriptionItem>
              <DescriptionItem label={t.limitAmount}>
                <Money amount={limits.amountLeftToday} currency="USD" />
              </DescriptionItem>
            </DescriptionList>
          </CardBody>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-4">
        <Card>
          <CardHeader title={t.summaryTitle} />
          <CardBody className="grid gap-4">
            <DescriptionList>
              <DescriptionItem label={t.summaryAmount}>
                {ready && amount ? <Money amount={amount} currency="USD" /> : "—"}
              </DescriptionItem>
              <DescriptionItem label={t.summaryFee}>{fee ? <Money amount={fee} currency="USD" /> : "—"}</DescriptionItem>
              <DescriptionItem label={t.summaryNet} emphasis>
                {net ? <Money amount={net} currency="USD" /> : "—"}
              </DescriptionItem>
            </DescriptionList>
            <Button
              type="submit"
              size="lg"
              block
              loading={submitting}
              aria-label={submitting ? (redirecting ? t.redirecting : t.creating) : undefined}
            >
              {t.submit}
            </Button>
            <p className="text-small text-ink-subtle" aria-live="polite">
              {note}
            </p>
          </CardBody>
        </Card>
      </aside>
    </form>
  );
}
