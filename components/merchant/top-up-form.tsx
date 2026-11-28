"use client";
// Add funds of a merchant rank (handoff §4.8): pick a payment method, type an amount, see the fee and the net exactly, then
// create the invoice. Manual methods go to the invoice page (instructions + receipt upload); automatic ones go straight to the
// payment provider (`paymentUrl`).
// `POST /client/invoices` carries an `Idempotency-Key` (lib/wallet/invoice-request.ts): the same key for the same amount and
// method (a double click, a retry), a new one when either changes, forgotten after a success and after 409
// IDEMPOTENCY_KEY_REUSED, so one press of the button never makes two invoices.
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { createIdempotencyKeys } from "@/lib/api/idempotency";
import type { InvoiceCreated, PaymentMethod } from "@/lib/api/types";
import { compareMoney, formatMoney, formatPercent, subtractMoney } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import { useMounted } from "@/lib/use-mounted";
import type { TopUpsMessages } from "@/lib/i18n/messages/top-ups";
import { ltr } from "@/lib/merchant/format";
import { leaveIfSignedOut } from "@/lib/merchant/signed-out";
import { parseAmountInput, topUpFee } from "@/lib/merchant/money-math";
import { forgetsInvoiceKey, submitInvoice } from "@/lib/wallet/invoice-request";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { PaymentMethodLogo } from "@/components/ui/payment-method-logo";
import { RadioCard, RadioGroup } from "@/components/ui/radio-card";
import { toast } from "@/components/ui/toast";

function isZero(money: string): boolean {
  return /^0+(\.0+)?$/.test(money.trim());
}

export function TopUpForm({
  methods,
  invoiceBase,
  labels,
}: {
  methods: PaymentMethod[];
  /** `/en/account/invoices`: the page of a new invoice is `${invoiceBase}/${id}`. */
  invoiceBase: string;
  labels: TopUpsMessages["merchant"]["add"];
}) {
  const router = useRouter();
  const errorText = useErrorText();
  const mounted = useMounted();
  const [keys] = useState(() => createIdempotencyKeys());
  const inFlight = useRef(false);
  const t = labels;
  const [methodId, setMethodId] = useState<number | null>(methods.length === 1 ? methods[0].id : null);
  const [amountText, setAmountText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "redirecting">("idle");
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ amount?: string; gatewayId?: string }>({});
  const errorRef = useRef<HTMLDivElement>(null);

  const method = methods.find((m) => m.id === methodId) ?? null;
  const amount = parseAmountInput(amountText);
  const fee = method && amount ? topUpFee(amount, method.feePercent, method.feeFixed) : null;
  const net = amount && fee ? subtractMoney(amount, fee) : null;

  function amountProblem(): string | undefined {
    if (amountText.trim() === "") return t.amountInvalid;
    if (!amount) return t.amountInvalid;
    if (method && !isZero(method.minAmount) && compareMoney(amount, method.minAmount) < 0) return fmt(t.amountBelow, { min: ltr(formatMoney(method.minAmount, method.currency)) });
    if (method && !isZero(method.maxAmount) && compareMoney(amount, method.maxAmount) > 0) return fmt(t.amountAbove, { max: ltr(formatMoney(method.maxAmount, method.currency)) });
    return undefined;
  }
  const localAmountError = amountProblem();
  // Only after a submit: a message appearing on blur would push the button down between press and release of a tap.
  const shownAmountError = fieldErrors.amount ?? (submitted ? localAmountError : undefined);
  const methodError = fieldErrors.gatewayId ?? (submitted && !method ? t.chooseMethod : undefined);

  function feeText(m: PaymentMethod): string {
    const percent = !isZero(m.feePercent);
    const fixed = !isZero(m.feeFixed);
    if (percent && fixed) return fmt(t.feeBoth, { percent: ltr(formatPercent(m.feePercent)), fixed: ltr(formatMoney(m.feeFixed, m.currency)) });
    if (percent) return fmt(t.feePercent, { percent: ltr(formatPercent(m.feePercent)) });
    if (fixed) return fmt(t.feeFixed, { fixed: ltr(formatMoney(m.feeFixed, m.currency)) });
    return t.feeNone;
  }

  function limitText(m: PaymentMethod): string {
    const min = isZero(m.minAmount) ? null : ltr(formatMoney(m.minAmount, m.currency));
    const max = isZero(m.maxAmount) ? null : ltr(formatMoney(m.maxAmount, m.currency));
    if (min && max) return fmt(t.limits, { min, max });
    if (min) return fmt(t.limitMin, { min });
    if (max) return fmt(t.limitMax, { max });
    return t.limitNone;
  }

  function showError(message: string, reference?: string) {
    setError({ message, reference });
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A ref, not state: a second click can arrive before React has re-rendered the disabled button.
    if (inFlight.current) return;
    setSubmitted(true);
    setError(null);
    setFieldErrors({});
    if (!method) {
      document.getElementById("topup-methods")?.focus();
      return;
    }
    if (localAmountError || !amount) {
      document.getElementById("topup-amount")?.focus();
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    try {
      const { created: res, next } = await submitInvoice(
        (path, body, options) => api.post<InvoiceCreated>(path, body, options),
        keys,
        { amount, gatewayId: method.id },
        invoiceBase,
      );
      if (next.kind === "unsafe-url") {
        inFlight.current = false;
        setSubmitting(false);
        showError(t.invalidPaymentUrl);
        return;
      }
      if (next.kind === "pay") {
        setStatus("redirecting");
        window.location.assign(next.url);
        return; // stay disabled: the browser is leaving the page
      }
      toast.success(res.invoice.number);
      router.push(next.href);
      router.refresh();
    } catch (e) {
      inFlight.current = false;
      setSubmitting(false);
      if (forgetsInvoiceKey(e)) keys.reset();
      if (leaveIfSignedOut(e, router)) return;
      if (isApiError(e) && e.status === 422 && e.fieldErrors.length > 0) {
        const next: { amount?: string; gatewayId?: string } = {};
        for (const fe of e.fieldErrors) {
          if (fe.field === "amount") next.amount ??= errorText.field(fe);
          else if (fe.field === "gatewayId") next.gatewayId ??= errorText.field(fe);
        }
        if (next.amount || next.gatewayId) {
          setFieldErrors(next);
          requestAnimationFrame(() => document.getElementById(next.gatewayId ? "topup-methods" : "topup-amount")?.focus());
          return;
        }
      }
      showError(errorText.message(e), errorText.reference(e));
    }
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate aria-busy={submitting || undefined} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="grid min-w-0 gap-6">
        <div ref={errorRef} tabIndex={-1} className="empty:hidden focus:outline-none">
          {error ? (
            <Alert tone="danger">
              {error.message}
              {error.reference ? <span className="mt-1 block text-small num">{error.reference}</span> : null}
            </Alert>
          ) : null}
        </div>

        <Card>
          <CardBody className="grid gap-6">
            <div id="topup-methods" tabIndex={-1} className="focus:outline-none">
              <RadioGroup legend={t.methodLegend} required columns={2} error={methodError}>
                {methods.map((m) => {
                  return (
                    <RadioCard
                      key={m.id}
                      name="gatewayId"
                      value={m.id}
                      checked={methodId === m.id}
                      onChange={() => {
                        setMethodId(m.id);
                        setFieldErrors((prev) => ({ ...prev, gatewayId: undefined }));
                      }}
                      icon={<PaymentMethodLogo name={m.name} alt="" logoUrl={m.logoUrl} preset={m.preset} methodType={m.methodType} />}
                      title={m.name}
                      trailing={<Badge tone={m.kind === "manual" ? "neutral" : "success"}>{m.kind === "manual" ? t.manual : t.automatic}</Badge>}
                    >
                      <span className="grid gap-0.5 text-small text-ink-subtle">
                        <span>{feeText(m)}</span>
                        <span>{limitText(m)}</span>
                        {m.holdHours > 0 ? <span>{fmt(t.hold, { hours: m.holdHours })}</span> : null}
                      </span>
                    </RadioCard>
                  );
                })}
              </RadioGroup>
            </div>

            <Input
              id="topup-amount"
              name="amount"
              label={t.amount}
              required
              inputMode="decimal"
              autoComplete="off"
              dir="ltr"
              value={amountText}
              onChange={(e) => {
                setAmountText(e.target.value);
                setFieldErrors((prev) => ({ ...prev, amount: undefined }));
              }}
              leading={<span aria-hidden="true" className="text-body font-semibold">$</span>}
              hint={t.amountHint}
              error={shownAmountError}
              fieldClassName="sm:max-w-sm"
            />
          </CardBody>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-4">
        <Card>
          <CardHeader title={t.previewTitle} />
          <CardBody className="grid gap-4">
            <DescriptionList>
              <DescriptionItem label={t.previewAmount}>{amount && !localAmountError ? <Money amount={amount} currency="USD" /> : "—"}</DescriptionItem>
              <DescriptionItem label={t.previewFee}>{fee && !localAmountError ? <Money amount={fee} currency="USD" /> : "—"}</DescriptionItem>
              <DescriptionItem label={t.previewNet} emphasis>
                {net && !localAmountError ? <Money amount={net} currency="USD" /> : "—"}
              </DescriptionItem>
            </DescriptionList>
            <Button type="submit" size="lg" block loading={submitting} disabled={!mounted} aria-label={submitting ? (status === "redirecting" ? t.redirecting : t.creating) : undefined}>
              {t.submit}
            </Button>
            <p className="text-small text-ink-subtle" aria-live="polite">
              {status === "redirecting" ? t.redirecting : t.previewNote}
            </p>
          </CardBody>
        </Card>
      </aside>
    </form>
  );
}
