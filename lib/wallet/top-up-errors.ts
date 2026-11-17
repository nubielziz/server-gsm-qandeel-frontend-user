// The rules of a customer top-up as pure functions (plan F33, BH §3.3, §3.6): the checks the form makes before it sends
// anything (the top-up route's limiter counts refusals too: 10 attempts in 10 minutes, so a request that is certain to be
// refused is never sent), the text of every refusal the top-up, receipt, cancel and upload routes can answer, and the
// schedule of the poller that follows an online payment. No React, no cookies, money as 4-decimal strings (BigInt helpers
// only): safe to import anywhere and unit-tested.
import { isApiError, type FieldError } from "@/lib/api/errors";
import type { CustomerWallet, TopUpMethod } from "@/lib/api/types";
import { compareMoney, formatMoney, subtractMoney } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import type { ErrorText } from "@/lib/i18n/error-text-core";
import type { TopUpsMessages } from "@/lib/i18n/messages/top-ups";
import { ltr } from "@/lib/merchant/format";
import { topUpFee } from "@/lib/merchant/money-math";

// ── Limits and the checks before a request ──────────────────────────────────────────────────────────────────────────

/** The part of `GET /store/v1/me/wallet` `limits` that decides whether an amount can be sent. */
export type TopUpLimits = Pick<
  CustomerWallet["limits"],
  "minTopUp" | "maxTopUp" | "maxBalance" | "room" | "topUpsLeftToday" | "amountLeftToday"
>;

/** What a method says about its own limits (`0.0000` = none). */
export type MethodLimits = Pick<TopUpMethod, "minAmount" | "maxAmount">;

/** A method as the checks need it: its limits and its fee. */
export type MethodRules = MethodLimits & Pick<TopUpMethod, "feePercent" | "feeFixed">;

/** True for "no limit": `0.0000`, `0`, empty or missing. */
export function isNoLimit(amount: string | undefined): boolean {
  return !amount || /^0+(\.0+)?$/.test(amount.trim());
}

/** Runs `compute`; a malformed money string from the API must never break a page, so any throw gives `otherwise`. */
function safe<T>(compute: () => T, otherwise: T): T {
  try {
    return compute();
  } catch {
    return otherwise;
  }
}

/** `amount` is above `limit` (false when either is unreadable: the API decides then). */
function exceeds(amount: string, limit: string | undefined): boolean {
  return limit !== undefined && safe(() => compareMoney(amount, limit) > 0, false);
}

/**
 * The smallest and largest amount one top-up may have: the stricter of the method's own limit and the wallet's
 * (`limits.minTopUp`, `limits.maxTopUp`). `null` = no limit on that side.
 */
export function effectiveLimits(
  method: MethodLimits | null | undefined,
  limits: Pick<TopUpLimits, "minTopUp" | "maxTopUp">,
): { min: string | null; max: string | null } {
  const mins = [method?.minAmount, limits.minTopUp].filter((m): m is string => !isNoLimit(m));
  const maxs = [method?.maxAmount, limits.maxTopUp].filter((m): m is string => !isNoLimit(m));
  return {
    min: mins.length ? mins.reduce((a, b) => (safe(() => compareMoney(a, b) >= 0, true) ? a : b)) : null,
    max: maxs.length ? maxs.reduce((a, b) => (safe(() => compareMoney(a, b) <= 0, true) ? a : b)) : null,
  };
}

/** `amount × feePercent / 100 + feeFixed`: an estimate (the top-up shows the final fee), or null for an unreadable fee. */
export function estimateTopUpFee(amount: string, method: Pick<TopUpMethod, "feePercent" | "feeFixed">): string | null {
  return safe<string | null>(() => topUpFee(amount, method.feePercent, method.feeFixed), null);
}

/**
 * What the balance would receive: the amount minus the estimated fee (null when the fee cannot be worked out, or when it
 * would use up the whole amount).
 */
export function estimateNet(amount: string, method: Pick<TopUpMethod, "feePercent" | "feeFixed">): string | null {
  const fee = estimateTopUpFee(amount, method);
  if (fee === null) return null;
  return safe<string | null>(() => (compareMoney(fee, amount) >= 0 ? null : subtractMoney(amount, fee)), null);
}

/** Why an amount is certain to be refused: the API's own codes, plus `invalid` for a text that is no positive amount. */
export type AmountProblem = "invalid" | "daily_count" | "min" | "max" | "fee" | "max_balance" | "daily_amount";

/**
 * Why a top-up of `amount` is certain to be refused, or null. The codes are the API's own (`min`, `max`, `fee`,
 * `daily_count`, `daily_amount`, `max_balance`), plus `invalid` for a text that is no positive amount. The first
 * problem in this order wins: invalid, no top-up left today, below the minimum, above the maximum, fee, room, amount left today.
 *
 * - `limits.room` is compared with what the balance would RECEIVE (amount minus fee), the more lenient reading: a request
 *   the API would accept is never blocked here.
 * - `limits.amountLeftToday` is compared with what the customer PAYS (the gross amount): the API adds up `invoices.amount`
 *   of the last 24 hours, fees included, so a net comparison would let through a request the API refuses (and the refusal
 *   uses one of the limiter's attempts).
 * - `amount` is the canonical 4-decimal string of `parseAmountInput`, or null for a text that is not an amount.
 */
export function topUpAmountProblem(input: { amount: string | null; method: MethodRules | null; limits: TopUpLimits }): AmountProblem | null {
  const { amount, method, limits } = input;
  if (!amount) return "invalid";
  if (limits.topUpsLeftToday <= 0) return "daily_count";
  const { min, max } = effectiveLimits(method, limits);
  if (min && safe(() => compareMoney(amount, min) < 0, false)) return "min";
  if (max && exceeds(amount, max)) return "max";
  let net = amount;
  if (method) {
    const fee = estimateTopUpFee(amount, method);
    if (fee !== null && safe(() => compareMoney(fee, amount) >= 0, false)) return "fee";
    if (fee !== null) net = safe(() => subtractMoney(amount, fee), amount);
  }
  if (exceeds(net, limits.room)) return "max_balance";
  if (exceeds(amount, limits.amountLeftToday)) return "daily_amount";
  return null;
}

// ── What a refusal says ─────────────────────────────────────────────────────────────────────────────────────────────

/** What the text builders know about the form: its texts, the method chosen and the wallet's limits. */
export type TopUpTextContext = {
  /** `topUps.errors`. */
  t: TopUpsMessages["errors"];
  method?: MethodLimits | null;
  limits?: TopUpLimits;
};

const NO_LIMITS = { minTopUp: "0.0000", maxTopUp: "0.0000" };

const usd = (amount: string) => ltr(formatMoney(amount, "USD"));

/**
 * The sentence for an amount problem, from the form's own check or from the API's `422` on `amount` (`min`, `max`,
 * `fee`, `daily_count`, `daily_amount`, `max_balance`, `format`, `range`). A limit the form does not know is left out of
 * the sentence instead of being guessed.
 */
export function amountProblemText(code: AmountProblem | "format" | "range", context: TopUpTextContext): string {
  const { t, method, limits } = context;
  const { min, max } = effectiveLimits(method, limits ?? NO_LIMITS);
  switch (code) {
    case "min":
      return min ? fmt(t.min, { min: usd(min) }) : t.minUnknown;
    case "max":
      return max ? fmt(t.max, { max: usd(max) }) : t.maxUnknown;
    case "fee":
      return t.fee;
    case "daily_count":
      return t.dailyCount;
    case "daily_amount":
      return limits && !isNoLimit(limits.amountLeftToday) ? fmt(t.dailyAmountLeft, { left: usd(limits.amountLeftToday) }) : t.dailyAmount;
    case "max_balance":
      if (!limits) return t.maxBalance;
      return isNoLimit(limits.room) ? t.maxBalanceFull : fmt(t.maxBalanceRoom, { room: usd(limits.room) });
    default:
      // invalid, format and range: no positive amount with at most four decimals.
      return t.format;
  }
}

/** The routes a top-up error can come from. */
export type TopUpAction = "create" | "receipt" | "cancel" | "upload";

/** The input a refusal belongs under. */
export type TopUpField = "amount" | "gatewayId" | "fileId" | "reference" | "file";

export type TopUpErrorContext = TopUpTextContext & {
  action: TopUpAction;
  /** The generic translator by code: `useErrorText()` in a Client Component. */
  generic: ErrorText;
};

export type TopUpErrorResult = {
  /** The sentence to show, in the page language. */
  text: string;
  /** The input it belongs under; absent = a message for the whole form. */
  field?: TopUpField;
  /** The top-up is no longer what the page shows (it was credited, closed or reviewed meanwhile): refresh the page. */
  refresh?: boolean;
  /** The key of the request was used for another body: forget it, the next attempt takes a new one. */
  forgetKey?: boolean;
};

/** The text of one `422` field error we know how to word, or undefined. */
function fieldResult(fe: FieldError, context: TopUpErrorContext): TopUpErrorResult | undefined {
  const { t, generic } = context;
  const code = fe.code.toLowerCase();
  switch (fe.field) {
    case "amount":
      if (["min", "max", "fee", "daily_count", "daily_amount", "max_balance", "format", "range"].includes(code)) {
        return { field: "amount", text: amountProblemText(code as AmountProblem | "format" | "range", context) };
      }
      return { field: "amount", text: generic.field(fe) ?? t.format };
    case "gatewayId":
      return { field: "gatewayId", text: code === "unavailable" ? t.gatewayUnavailable : (generic.field(fe) ?? t.gatewayUnavailable) };
    case "fileId":
      return { field: "fileId", text: code === "invalid" ? t.fileInvalid : (generic.field(fe) ?? t.fileInvalid) };
    case "reference":
      return { field: "reference", text: code === "taken" ? t.referenceTaken : (generic.field(fe) ?? t.referenceTaken) };
    case "file":
      if (code === "type") return { field: "file", text: t.fileType };
      if (code === "empty") return { field: "file", text: t.fileEmpty };
      return { field: "file", text: generic.field(fe) ?? t.fileType };
    default:
      return undefined;
  }
}

/**
 * The text of any failure of the top-up routes (`POST …/top-ups`, `…/receipt`, `…/cancel`, `POST /store/v1/files`), by
 * the answer's status, code and field codes (the API's own texts are English):
 *
 * | Answer | Result |
 * |---|---|
 * | 422 `amount` min, max, fee, daily_count, daily_amount, max_balance | the limit in words (with the number when known) |
 * | 422 `amount` format, range | enter a valid amount |
 * | 422 `gatewayId` unavailable | choose another method |
 * | 422 `fileId` invalid | upload the receipt again |
 * | 422 `reference` taken | this reference was already used |
 * | 422 `file` type, empty | file texts |
 * | 413 | the file is larger than 5 MB |
 * | 409 CONFLICT on create | three unpaid top-ups |
 * | 409 CONFLICT on receipt or cancel | "can no longer be changed" and a refresh |
 * | 409 WALLET_DISABLED | by code |
 * | 409 WALLET_FROZEN | by code, and "a bank transfer still works" |
 * | 409 IDEMPOTENCY_IN_PROGRESS, IDEMPOTENCY_KEY_REUSED | by code (the second also forgets the key) |
 * | 429 | the wait (`Retry-After`) |
 * | 502 GATEWAY_ERROR and anything else | by code, else the generic text |
 *
 * It never throws and never returns the API's English `detail`.
 */
export function topUpErrorText(error: unknown, context: TopUpErrorContext): TopUpErrorResult {
  const { generic, t, action } = context;
  const byCode: TopUpErrorResult = { text: generic.message(error) };
  if (!isApiError(error)) return byCode;

  if (error.status === 422) {
    for (const fe of error.fieldErrors) {
      const result = fieldResult(fe, context);
      if (result) return result;
    }
    return byCode;
  }
  if (error.status === 413) return { text: t.fileTooLarge, field: action === "upload" ? "file" : undefined };

  switch (error.code) {
    case "CONFLICT":
    case "INVALID_TRANSITION":
      if (action === "create") return error.code === "CONFLICT" ? { text: t.unpaidLimit } : byCode;
      if (action === "receipt" || action === "cancel") return { text: t.changed, refresh: true };
      return byCode;
    case "WALLET_FROZEN":
      return { text: `${byCode.text} ${t.frozenHint}` };
    case "IDEMPOTENCY_KEY_REUSED":
      return { text: byCode.text, forgetKey: true };
    default:
      // WALLET_DISABLED, IDEMPOTENCY_IN_PROGRESS, RATE_LIMITED (with the wait), GATEWAY_ERROR, CSRF_FAILED, 5xx …
      return byCode;
  }
}

// ── The poller that follows an online payment (BH §3.3, plan D8) ────────────────────────────────────────────────────

/** The poller gives up after two minutes and says so. */
export const POLL_WINDOW_MS = 120_000;

/** A top-up in one of these states will not change again by itself. */
export function isFinalTopUp(status: string): boolean {
  return status === "credited" || status === "rejected" || status === "cancelled";
}

/**
 * How long to wait before the next read: 5 s while the payment is awaited, 15 s once it is `in_review` (a gateway
 * confirmation takes at least 10 minutes to credit). A `Retry-After` (429, 503 MAINTENANCE) is never undercut.
 */
export function pollDelayMs(status: string, retryAfterSeconds?: number): number {
  const base = status === "in_review" ? 15_000 : 5_000;
  if (retryAfterSeconds && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.max(base, Math.ceil(retryAfterSeconds) * 1000);
  }
  return base;
}

/** The next read still falls inside the two-minute window. */
export function shouldPollAgain(elapsedMs: number, delayMs: number): boolean {
  return elapsedMs + delayMs <= POLL_WINDOW_MS;
}
