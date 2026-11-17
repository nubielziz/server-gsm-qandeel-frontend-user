import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { INTL_LOCALE } from "./config";
import { fmt, plural } from "./define";
import { errorText } from "./error-text-core";
import { errors } from "./messages/errors";

describe("Intl locale", () => {
  it("formats in US English", () => {
    expect(INTL_LOCALE).toBe("en-US");
  });
});

describe("messages", () => {
  it("fills placeholders and leaves unknown ones", () => {
    expect(fmt("Pay {amount} now {x}", { amount: "$5" })).toBe("Pay $5 now {x}");
  });
  it("picks the English plural form, and `zero` for a count of 0 when there is one", () => {
    const forms = { one: "{count} service", other: "{count} services" };
    expect(plural(1, forms)).toBe("1 service");
    expect(plural(3, forms)).toBe("3 services");
    expect(plural(0, forms)).toBe("0 services");
    expect(plural(0, { zero: "No services", ...forms })).toBe("No services");
    expect(plural(1200, forms, "1,200")).toBe("1,200 services");
  });
});

describe("error texts", () => {
  const en = errorText(errors);
  const problem = (code: string, extra: { status?: number; retryAfter?: number } = {}) =>
    new ApiError({ status: extra.status ?? 409, code, retryAfter: extra.retryAfter });

  it("translates the wallet codes (no generic fallback)", () => {
    for (const code of ["WALLET_FROZEN", "WALLET_DISABLED"]) {
      expect(en.message(problem(code))).not.toBe(errors.codes.fallback);
    }
    expect(en.message(problem("WALLET_FROZEN"))).not.toBe(en.message(problem("WALLET_DISABLED")));
    expect(en.message(problem("WALLET_FROZEN"))).toMatch(/on hold/);
  });

  it("words the idempotency errors for any request, not only payments", () => {
    expect(en.message(problem("IDEMPOTENCY_IN_PROGRESS"))).toBe("Your request is still being processed. Wait a moment.");
    expect(en.message(problem("IDEMPOTENCY_KEY_REUSED"))).toBe("This request changed while it was being sent. Try again.");
    for (const code of ["IDEMPOTENCY_IN_PROGRESS", "IDEMPOTENCY_KEY_REUSED"]) {
      expect(en.message(problem(code))).not.toMatch(/payment/i);
    }
  });

  it("translates the top-up and upload field codes", () => {
    for (const code of ["fee", "daily_count", "daily_amount", "max_balance", "type"]) {
      const field = { field: code === "type" ? "file" : "amount", code, message: "English from the API" };
      expect(en.field(field), code).not.toBe(errors.fields.fallback);
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
  });

  it("adds no wait text without a Retry-After or on another code", () => {
    expect(en.message(problem("RATE_LIMITED", { status: 429 }))).toBe(errors.codes.RATE_LIMITED);
    expect(en.message(problem("CONFLICT", { retryAfter: 900 }))).toBe(errors.codes.CONFLICT);
  });
});
