import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { dirOf, isLocale, localePath, switchLocalePath } from "./config";
import { defineMessages, fmt, plural } from "./define";
import { errorText } from "./error-text-core";
import { errors } from "./messages/errors";

describe("locale paths", () => {
  it("prefixes and swaps the language segment", () => {
    expect(localePath("ar", "/services")).toBe("/ar/services");
    expect(localePath("en")).toBe("/en");
    expect(switchLocalePath("/en/services/x", "ar")).toBe("/ar/services/x");
    expect(switchLocalePath("/ar", "en")).toBe("/en");
    expect(switchLocalePath("/help", "ar")).toBe("/ar/help");
  });
  it("knows the two languages and their direction", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
  });
});

describe("messages", () => {
  it("fills placeholders and leaves unknown ones", () => {
    expect(fmt("Pay {amount} now {x}", { amount: "$5" })).toBe("Pay $5 now {x}");
  });
  it("uses Arabic plural categories", () => {
    const forms = { zero: "لا خدمات", one: "خدمة واحدة", two: "خدمتان", few: "{count} خدمات", many: "{count} خدمة", other: "{count} خدمة" };
    expect(plural("ar", 0, forms)).toBe("لا خدمات");
    expect(plural("ar", 1, forms)).toBe("خدمة واحدة");
    expect(plural("ar", 2, forms)).toBe("خدمتان");
    expect(plural("ar", 5, forms)).toBe("5 خدمات");
    expect(plural("ar", 11, forms)).toBe("11 خدمة");
    expect(plural("en", 1, { one: "{count} service", other: "{count} services" })).toBe("1 service");
    expect(plural("en", 3, { one: "{count} service", other: "{count} services" })).toBe("3 services");
  });
  it("defineMessages returns both languages", () => {
    const ns = defineMessages({ en: { a: "A", b: { c: "C" } }, ar: { a: "أ", b: { c: "ج" } } });
    expect(ns.ar.b.c).toBe("ج");
  });
});

describe("error texts", () => {
  const en = errorText(errors.en);
  const ar = errorText(errors.ar);
  const problem = (code: string, extra: { status?: number; retryAfter?: number } = {}) =>
    new ApiError({ status: extra.status ?? 409, code, retryAfter: extra.retryAfter });

  it("translates the wallet codes in both languages (no generic fallback)", () => {
    for (const code of ["WALLET_FROZEN", "WALLET_DISABLED"]) {
      expect(en.message(problem(code))).not.toBe(errors.en.codes.fallback);
      expect(ar.message(problem(code))).not.toBe(errors.ar.codes.fallback);
      expect(en.message(problem(code))).not.toBe(ar.message(problem(code)));
    }
    expect(en.message(problem("WALLET_FROZEN"))).toMatch(/on hold/);
  });

  it("words the idempotency errors for any request, not only payments", () => {
    expect(en.message(problem("IDEMPOTENCY_IN_PROGRESS"))).toBe("Your request is still being processed. Wait a moment.");
    expect(en.message(problem("IDEMPOTENCY_KEY_REUSED"))).toBe("This request changed while it was being sent. Try again.");
    for (const code of ["IDEMPOTENCY_IN_PROGRESS", "IDEMPOTENCY_KEY_REUSED"]) {
      expect(en.message(problem(code))).not.toMatch(/payment/i);
      expect(ar.message(problem(code))).not.toContain("الدفع");
    }
  });

  it("translates the top-up and upload field codes", () => {
    for (const code of ["fee", "daily_count", "daily_amount", "max_balance", "type"]) {
      const field = { field: code === "type" ? "file" : "amount", code, message: "English from the API" };
      expect(en.field(field), code).not.toBe(errors.en.fields.fallback);
      expect(ar.field(field), code).not.toBe(errors.ar.fields.fallback);
    }
    const error = new ApiError({
      status: 422,
      code: "VALIDATION_FAILED",
      fieldErrors: [{ field: "amount", code: "max_balance", message: "Your store balance can hold at most 1000.0000 USD." }],
    });
    expect(en.fields(error).amount).toMatch(/store balance/);
  });

  it("gives the wait in seconds under two minutes", () => {
    const wait = (retryAfter: number) => en.message(problem("RATE_LIMITED", { status: 429, retryAfter }));
    expect(wait(42)).toBe("Too many attempts. Please wait and try again. Try again in 42 s.");
    expect(wait(119)).toContain("Try again in 119 s.");
  });

  it("gives the wait in minutes from two minutes on, rounded up", () => {
    const wait = (retryAfter: number) => en.message(problem("RATE_LIMITED", { status: 429, retryAfter }));
    expect(wait(120)).toContain("Try again in about 2 min.");
    expect(wait(900)).toBe("Too many attempts. Please wait and try again. Try again in about 15 min.");
    expect(wait(901)).toContain("about 16 min.");
    expect(ar.message(problem("RATE_LIMITED", { status: 429, retryAfter: 900 }))).toContain("بعد نحو 15 د.");
  });

  it("adds no wait text without a Retry-After or on another code", () => {
    expect(en.message(problem("RATE_LIMITED", { status: 429 }))).toBe(errors.en.codes.RATE_LIMITED);
    expect(en.message(problem("CONFLICT", { retryAfter: 900 }))).toBe(errors.en.codes.CONFLICT);
  });
});
