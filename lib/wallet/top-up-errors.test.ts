import { describe, expect, it } from "vitest";
import { ApiError, type FieldError } from "@/lib/api/errors";
import { errorText } from "@/lib/i18n/error-text-core";
import { errors } from "@/lib/i18n/messages/errors";
import { topUps } from "@/lib/i18n/messages/top-ups";
import {
  amountProblemText,
  effectiveLimits,
  estimateNet,
  estimateTopUpFee,
  isFinalTopUp,
  isNoLimit,
  POLL_WINDOW_MS,
  pollDelayMs,
  shouldPollAgain,
  topUpAmountProblem,
  topUpErrorText,
  type MethodRules,
  type TopUpAction,
  type TopUpLimits,
} from "./top-up-errors";

// The demo customer wallet's defaults (BH §3.1): $5 to $500 per top-up, $1000 highest balance, 5 top-ups and $1000 a day.
const LIMITS: TopUpLimits = {
  minTopUp: "5.0000",
  maxTopUp: "500.0000",
  maxBalance: "1000.0000",
  room: "1000.0000",
  topUpsLeftToday: 5,
  amountLeftToday: "1000.0000",
};

// The e2e gateway: a manual method with no fee and its own 5 to 500 limits.
const CLIQ: MethodRules = { minAmount: "5.0000", maxAmount: "500.0000", feePercent: "0.0000", feeFixed: "0.0000" };

/** A method with no limits of its own and a 2.5% + $0.30 fee. */
const CARD: MethodRules = { minAmount: "0.0000", maxAmount: "0.0000", feePercent: "2.5000", feeFixed: "0.3000" };

describe("effectiveLimits", () => {
  it("takes the stricter of the method's limit and the wallet's", () => {
    expect(effectiveLimits({ minAmount: "10.0000", maxAmount: "300.0000" }, LIMITS)).toEqual({ min: "10.0000", max: "300.0000" });
    expect(effectiveLimits({ minAmount: "1.0000", maxAmount: "900.0000" }, LIMITS)).toEqual({ min: "5.0000", max: "500.0000" });
  });

  it('reads "0.0000" as none on either side', () => {
    expect(effectiveLimits({ minAmount: "0.0000", maxAmount: "0.0000" }, LIMITS)).toEqual({ min: "5.0000", max: "500.0000" });
    expect(effectiveLimits({ minAmount: "0.0000", maxAmount: "0.0000" }, { minTopUp: "0.0000", maxTopUp: "0.0000" })).toEqual({ min: null, max: null });
    expect(effectiveLimits(null, { minTopUp: "0.0000", maxTopUp: "0.0000" })).toEqual({ min: null, max: null });
  });

  it("isNoLimit", () => {
    expect(isNoLimit("0.0000")).toBe(true);
    expect(isNoLimit("0")).toBe(true);
    expect(isNoLimit("")).toBe(true);
    expect(isNoLimit(undefined)).toBe(true);
    expect(isNoLimit("0.0001")).toBe(false);
    expect(isNoLimit("5.0000")).toBe(false);
  });
});

describe("fee and net", () => {
  it("estimates the fee exactly and the net from it", () => {
    expect(estimateTopUpFee("100.0000", CARD)).toBe("2.8000");
    expect(estimateNet("100.0000", CARD)).toBe("97.2000");
    expect(estimateTopUpFee("25.0000", CLIQ)).toBe("0.0000");
    expect(estimateNet("25.0000", CLIQ)).toBe("25.0000");
  });

  it("has no net when the fee would use up the amount, and no fee for an unreadable fee", () => {
    expect(estimateNet("0.2000", CARD)).toBeNull();
    expect(estimateTopUpFee("10.0000", { feePercent: "abc", feeFixed: "0" })).toBeNull();
    expect(estimateNet("10.0000", { feePercent: "abc", feeFixed: "0" })).toBeNull();
  });
});

describe("topUpAmountProblem", () => {
  const problem = (amount: string | null, over: Partial<TopUpLimits> = {}, method: MethodRules | null = CLIQ) =>
    topUpAmountProblem({ amount, method, limits: { ...LIMITS, ...over } });

  it("accepts an amount inside every limit", () => {
    expect(problem("25.0000")).toBeNull();
    expect(problem("5.0000")).toBeNull(); // the minimum itself
    expect(problem("500.0000")).toBeNull(); // the maximum itself
  });

  it("refuses a text that is no amount", () => {
    expect(problem(null)).toBe("invalid");
  });

  it("refuses below the minimum and above the maximum, to the cent", () => {
    expect(problem("2.0000")).toBe("min");
    expect(problem("4.9999")).toBe("min");
    expect(problem("500.0001")).toBe("max");
    expect(problem("600.0000")).toBe("max");
  });

  it("uses the stricter of the method's and the wallet's limit", () => {
    expect(problem("8.0000", {}, { ...CLIQ, minAmount: "10.0000" })).toBe("min");
    expect(problem("400.0000", {}, { ...CLIQ, maxAmount: "300.0000" })).toBe("max");
    expect(problem("4.0000", {}, CARD)).toBe("min"); // the method has none: the wallet's $5 applies
  });

  it("refuses when the fee would use up the amount", () => {
    expect(problem("5.0000", { minTopUp: "0.0000" }, { ...CARD, feeFixed: "5.0000" })).toBe("fee");
    expect(problem("5.0000", { minTopUp: "0.0000" }, { ...CARD, feePercent: "0.0000", feeFixed: "4.9999" })).toBeNull();
  });

  it("refuses an amount beyond the room left in the wallet, counted on what the balance receives", () => {
    expect(problem("100.0000", { room: "75.0000" })).toBe("max_balance");
    expect(problem("75.0000", { room: "75.0000" })).toBeNull();
    // 100 less the fee (2.8) is 97.2: it fits a room of 97.2 though 100 does not.
    expect(problem("100.0000", { room: "97.2000" }, CARD)).toBeNull();
    expect(problem("100.0000", { room: "97.1999" }, CARD)).toBe("max_balance");
    expect(problem("25.0000", { room: "0.0000" })).toBe("max_balance");
  });

  it("refuses an amount beyond what is left of the 24 hours", () => {
    expect(problem("100.0000", { amountLeftToday: "99.9999" })).toBe("daily_amount");
    expect(problem("100.0000", { amountLeftToday: "100.0000" })).toBeNull();
    expect(problem("25.0000", { amountLeftToday: "0.0000" })).toBe("daily_amount");
    // The API adds up what customers PAY (fee included): 100 less the fee is 97.2, yet 100 does not fit 99.
    expect(problem("100.0000", { amountLeftToday: "99.0000" }, CARD)).toBe("daily_amount");
    expect(problem("100.0000", { amountLeftToday: "97.2000" }, CARD)).toBe("daily_amount");
    expect(problem("100.0000", { amountLeftToday: "100.0000" }, CARD)).toBeNull();
  });

  it("refuses everything once no top-up is left today", () => {
    expect(problem("25.0000", { topUpsLeftToday: 0 })).toBe("daily_count");
    expect(problem("2.0000", { topUpsLeftToday: 0 })).toBe("daily_count");
    expect(problem(null, { topUpsLeftToday: 0 })).toBe("invalid");
  });

  it("checks the wallet's limits before a method is chosen", () => {
    expect(problem("2.0000", {}, null)).toBe("min");
    expect(problem("25.0000", {}, null)).toBeNull();
  });

  it("never throws for a strange limit from the API: it lets the API decide", () => {
    expect(problem("25.0000", { room: "abc", amountLeftToday: "" })).toBeNull();
    expect(problem("25.0000", { minTopUp: "x", maxTopUp: "y" })).toBeNull();
  });
});

describe("amountProblemText", () => {
  const en = { t: topUps.en.errors, locale: "en" as const, method: CLIQ, limits: LIMITS };

  it("names the limit (amounts isolated left-to-right)", () => {
    expect(amountProblemText("min", en)).toBe("The smallest top-up is ⁦$5.00⁩.");
    expect(amountProblemText("max", en)).toBe("The largest top-up is ⁦$500.00⁩.");
  });

  it("leaves a limit it does not know out of the sentence", () => {
    expect(amountProblemText("min", { t: topUps.en.errors, locale: "en" })).toBe(topUps.en.errors.minUnknown);
    expect(amountProblemText("max", { t: topUps.en.errors, locale: "en" })).toBe(topUps.en.errors.maxUnknown);
  });

  it("says how much room or how much of the day is left, or that there is none", () => {
    expect(amountProblemText("max_balance", { ...en, limits: { ...LIMITS, room: "75.0000" } })).toBe(
      "This would take your balance over the most it can hold. You can add up to ⁦$75.00⁩ more.",
    );
    expect(amountProblemText("max_balance", { ...en, limits: { ...LIMITS, room: "0.0000" } })).toBe(topUps.en.errors.maxBalanceFull);
    expect(amountProblemText("max_balance", { t: topUps.en.errors, locale: "en" })).toBe(topUps.en.errors.maxBalance);
    expect(amountProblemText("daily_amount", { ...en, limits: { ...LIMITS, amountLeftToday: "40.0000" } })).toContain("$40.00");
    expect(amountProblemText("daily_amount", { ...en, limits: { ...LIMITS, amountLeftToday: "0.0000" } })).toBe(topUps.en.errors.dailyAmount);
  });

  it("has a text for the rest", () => {
    expect(amountProblemText("fee", en)).toBe(topUps.en.errors.fee);
    expect(amountProblemText("daily_count", en)).toBe(topUps.en.errors.dailyCount);
    for (const code of ["invalid", "format", "range"] as const) expect(amountProblemText(code, en)).toBe(topUps.en.errors.format);
  });
});

describe("topUpErrorText: every row of the plan's table", () => {
  const field = (name: string, code: string): FieldError => ({ field: name, code, message: "the API's English text" });
  const unprocessable = (...fieldErrors: FieldError[]) =>
    new ApiError({ status: 422, code: "VALIDATION_FAILED", fieldErrors, requestId: "req-1" });
  const problem = (status: number, code: string, retryAfter?: number) => new ApiError({ status, code, retryAfter, requestId: "req-2" });

  const text = (error: unknown, action: TopUpAction) =>
    topUpErrorText(error, {
      action,
      locale: "en",
      t: topUps.en.errors,
      generic: errorText(errors.en),
      method: CLIQ,
      limits: LIMITS,
    });

  it("422 amount min and max: the limit in the sentence", () => {
    expect(text(unprocessable(field("amount", "min")), "create")).toEqual({ field: "amount", text: "The smallest top-up is ⁦$5.00⁩." });
    expect(text(unprocessable(field("amount", "max")), "create")).toEqual({ field: "amount", text: "The largest top-up is ⁦$500.00⁩." });
  });

  it("422 amount fee: the fee would use up the amount", () => {
    expect(text(unprocessable(field("amount", "fee")), "create")).toEqual({ field: "amount", text: topUps.en.errors.fee });
  });

  it("422 amount daily_count and daily_amount: the daily limit", () => {
    expect(text(unprocessable(field("amount", "daily_count")), "create")).toEqual({ field: "amount", text: topUps.en.errors.dailyCount });
    expect(text(unprocessable(field("amount", "daily_amount")), "create").text).toContain("up to ⁦$1,000.00⁩ today");
  });

  it("422 amount max_balance: with the room left", () => {
    expect(text(unprocessable(field("amount", "max_balance")), "create")).toEqual({
      field: "amount",
      text: "This would take your balance over the most it can hold. You can add up to ⁦$1,000.00⁩ more.",
    });
  });

  it("422 amount format and range: enter a valid amount", () => {
    expect(text(unprocessable(field("amount", "format")), "create")).toEqual({ field: "amount", text: topUps.en.errors.format });
    expect(text(unprocessable(field("amount", "range")), "create")).toEqual({ field: "amount", text: topUps.en.errors.format });
  });

  it("422 gatewayId unavailable: choose another method", () => {
    expect(text(unprocessable(field("gatewayId", "unavailable")), "create")).toEqual({ field: "gatewayId", text: topUps.en.errors.gatewayUnavailable });
  });

  it("422 fileId invalid: upload again", () => {
    expect(text(unprocessable(field("fileId", "invalid")), "receipt")).toEqual({ field: "fileId", text: topUps.en.errors.fileInvalid });
  });

  it("422 reference taken: this reference was already used", () => {
    expect(text(unprocessable(field("reference", "taken")), "receipt")).toEqual({ field: "reference", text: topUps.en.errors.referenceTaken });
  });

  it("422 file type and empty: the file texts", () => {
    expect(text(unprocessable(field("file", "type")), "upload")).toEqual({ field: "file", text: topUps.en.errors.fileType });
    expect(text(unprocessable(field("file", "empty")), "upload")).toEqual({ field: "file", text: topUps.en.errors.fileEmpty });
  });

  it("413: the file is larger than 5 MB", () => {
    expect(text(problem(413, "PAYLOAD_TOO_LARGE"), "upload")).toEqual({ field: "file", text: "The file is larger than 5 MB." });
    expect(text(problem(413, "PAYLOAD_TOO_LARGE"), "receipt").text).toBe("The file is larger than 5 MB.");
  });

  it("409 CONFLICT on create: three unpaid top-ups", () => {
    expect(text(problem(409, "CONFLICT"), "create")).toEqual({ text: "You already have three unpaid top-ups. Pay or cancel one first." });
  });

  it("409 CONFLICT on cancel or receipt: it can no longer be changed, and the page refreshes", () => {
    expect(text(problem(409, "CONFLICT"), "cancel")).toEqual({ text: "This top-up can no longer be changed.", refresh: true });
    expect(text(problem(409, "CONFLICT"), "receipt")).toEqual({ text: "This top-up can no longer be changed.", refresh: true });
  });

  it("409 WALLET_DISABLED: by code", () => {
    expect(text(problem(409, "WALLET_DISABLED"), "create")).toEqual({ text: errors.en.codes.WALLET_DISABLED });
  });

  it("409 WALLET_FROZEN: by code, plus a bank transfer still works", () => {
    expect(text(problem(409, "WALLET_FROZEN"), "create")).toEqual({ text: `${errors.en.codes.WALLET_FROZEN} A bank transfer still works.` });
  });

  it("409 idempotency codes: by code, and a reused key is forgotten", () => {
    expect(text(problem(409, "IDEMPOTENCY_IN_PROGRESS"), "create")).toEqual({ text: errors.en.codes.IDEMPOTENCY_IN_PROGRESS });
    expect(text(problem(409, "IDEMPOTENCY_KEY_REUSED"), "create")).toEqual({ text: errors.en.codes.IDEMPOTENCY_KEY_REUSED, forgetKey: true });
  });

  it("429: the wait", () => {
    expect(text(problem(429, "RATE_LIMITED", 42), "create").text).toBe(`${errors.en.codes.RATE_LIMITED} Try again in 42 s.`);
    expect(text(problem(429, "RATE_LIMITED", 600), "create").text).toBe(`${errors.en.codes.RATE_LIMITED} Try again in about 10 min.`);
    expect(text(problem(429, "RATE_LIMITED"), "create").text).toBe(errors.en.codes.RATE_LIMITED);
  });

  it("502 GATEWAY_ERROR: by code", () => {
    expect(text(problem(502, "GATEWAY_ERROR"), "create")).toEqual({ text: errors.en.codes.GATEWAY_ERROR });
  });

  it("anything else: the generic text of its code, never the API's English", () => {
    expect(text(problem(500, "INTERNAL_ERROR"), "create").text).toBe(errors.en.codes.INTERNAL_ERROR);
    expect(text(problem(403, "CSRF_FAILED"), "cancel").text).toBe(errors.en.codes.CSRF_FAILED);
    expect(text(new ApiError({ status: 0, code: "NETWORK_ERROR" }), "create").text).toBe(errors.en.codes.NETWORK_ERROR);
    expect(text(new Error("boom"), "create").text).toBe(errors.en.codes.fallback);
    // A 422 on a field the form has no input for (a missing Idempotency-Key) is the whole-form text.
    expect(text(unprocessable(field("idempotency-key", "invalid_type")), "create")).toEqual({ text: errors.en.codes.VALIDATION_FAILED });
  });

  it("reads the first field error it can place", () => {
    expect(text(unprocessable(field("idempotency-key", "invalid_type"), field("gatewayId", "unavailable")), "create").field).toBe("gatewayId");
  });
});

describe("the poller's schedule", () => {
  it("reads every 5 s while the payment is awaited and every 15 s once it is in review", () => {
    expect(pollDelayMs("awaiting_payment")).toBe(5_000);
    expect(pollDelayMs("in_review")).toBe(15_000);
  });

  it("never undercuts a Retry-After", () => {
    expect(pollDelayMs("awaiting_payment", 2)).toBe(5_000);
    expect(pollDelayMs("awaiting_payment", 30)).toBe(30_000);
    expect(pollDelayMs("in_review", 10)).toBe(15_000);
    expect(pollDelayMs("in_review", 20.2)).toBe(21_000);
    expect(pollDelayMs("awaiting_payment", 0)).toBe(5_000);
    expect(pollDelayMs("awaiting_payment", Number.NaN)).toBe(5_000);
  });

  it("stops after two minutes", () => {
    expect(POLL_WINDOW_MS).toBe(120_000);
    expect(shouldPollAgain(0, 5_000)).toBe(true);
    expect(shouldPollAgain(115_000, 5_000)).toBe(true);
    expect(shouldPollAgain(116_000, 5_000)).toBe(false);
    expect(shouldPollAgain(105_000, 15_000)).toBe(true);
    expect(shouldPollAgain(106_000, 15_000)).toBe(false);
  });

  it("knows the final states", () => {
    for (const status of ["credited", "rejected", "cancelled"]) expect(isFinalTopUp(status)).toBe(true);
    for (const status of ["awaiting_payment", "in_review", "unknown"]) expect(isFinalTopUp(status)).toBe(false);
  });
});
