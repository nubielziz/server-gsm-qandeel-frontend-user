// What a page does with a failed API call (lib/merchant/load.ts): sign-in, the account home, the 404 page, or the inline notice.
import { describe, expect, it, vi } from "vitest";

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}
class NotFound extends Error {}

vi.mock("next/headers", () => ({ cookies: async () => ({ has: () => false }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
  notFound: () => {
    throw new NotFound("not found");
  },
}));
vi.mock("@/lib/api/server", () => ({ apiSessionGet: vi.fn() }));

import { ApiError } from "@/lib/api/errors";
import { errorText, type ErrorText } from "@/lib/i18n/error-text-core";
import { errors } from "@/lib/i18n/messages/errors";
import { routeOnError, settle } from "./load";

function problem(status: number, code: string): ApiError {
  return new ApiError({ status, code });
}

/** What `routeOnError` does: the address it redirects to, "not-found", or null when it returns normally. */
function outcome(error: unknown, options: Parameters<typeof routeOnError>[1] = {}): string | null {
  try {
    routeOnError(error, options);
    return null;
  } catch (thrown) {
    if (thrown instanceof Redirected) return thrown.to;
    if (thrown instanceof NotFound) return "not-found";
    throw thrown;
  }
}

describe("routeOnError", () => {
  it("sends a signed-out answer to the sign-in page, back to the page, with no account type", () => {
    for (const error of [problem(401, "UNAUTHORIZED"), problem(403, "ACCOUNT_SUSPENDED"), problem(403, "IP_NOT_ALLOWED")]) {
      expect(outcome(error, { next: "/en/account/orders" }), error.code).toBe("/en/sign-in?next=%2Fen%2Faccount%2Forders");
    }
    expect(outcome(problem(401, "UNAUTHORIZED"))).toBe("/en/sign-in");
  });

  it("sends a rank refusal to the account home, never to the sign-in page", () => {
    expect(outcome(problem(403, "RANK_NOT_ALLOWED"), { next: "/en/account/services" })).toBe("/en/account");
    expect(outcome(problem(403, "RANK_NOT_ALLOWED"), { next: "/en/account/invoices/7?x=1" })).toBe("/en/account");
    expect(outcome(problem(403, "RANK_NOT_ALLOWED"))).toBe("/en/account");
  });

  it("does not redirect the account home to itself: it shows the notice", () => {
    for (const next of ["/en/account", "/en/account/", "/en/account?tab=1", "/en/account#top"]) {
      expect(outcome(problem(403, "RANK_NOT_ALLOWED"), { next }), next).toBeNull();
    }
    expect(outcome(problem(403, "RANK_NOT_ALLOWED"), { next: "/en/account/orders" })).toBe("/en/account");
  });

  it("answers 404 with the 404 page only when asked", () => {
    expect(outcome(problem(404, "NOT_FOUND"), { next: "/en/account/orders/9", notFoundOn404: true })).toBe("not-found");
    expect(outcome(problem(404, "NOT_FOUND"), { next: "/en/account/orders/9" })).toBeNull();
  });

  it("returns for anything else the page should show", () => {
    for (const error of [
      problem(500, "INTERNAL_ERROR"),
      problem(403, "CSRF_FAILED"),
      problem(429, "RATE_LIMITED"),
      new Error("bug"),
      "text",
      null,
    ]) {
      expect(outcome(error, { next: "/en/account", notFoundOn404: true })).toBeNull();
    }
  });
});

describe("settle", () => {
  it("returns the value or the error, never throwing", async () => {
    expect(await settle(Promise.resolve(5))).toEqual({ ok: true, data: 5 });
    const error = problem(500, "INTERNAL_ERROR");
    expect(await settle(Promise.reject(error))).toEqual({ ok: false, error });
  });
});

describe("the text of a rank refusal", () => {
  const text: ErrorText = errorText(errors);

  it("has its own words and no pending-approval wording", () => {
    const message = text.message(problem(403, "RANK_NOT_ALLOWED"));
    expect(message).not.toBe(errors.codes.fallback);
    expect(message).toMatch(/not available for your account/);
    expect("ACCOUNT_PENDING_APPROVAL" in errors.codes).toBe(false);
  });
});
