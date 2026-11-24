// What a client form does with a signed-out answer (lib/merchant/signed-out.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, csrfToken, forgetCsrf } from "@/lib/api/browser";
import { ApiError } from "@/lib/api/errors";
import { isRankRefusal, isSignedOutError, leaveIfSignedOut } from "./signed-out";

function problem(status: number, code: string): ApiError {
  return new ApiError({ status, code });
}

/** Gives the browser client a token to remember, as an answer's header would. */
async function rememberToken(token: string): Promise<void> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200, headers: { "x-csrf-token": token } })),
  );
  await api.get("/client/auth/me");
}

beforeEach(() => {
  forgetCsrf();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isSignedOutError", () => {
  it("is true for a 401, a suspended account and a blocked network, and for nothing else", () => {
    expect(isSignedOutError(problem(401, "UNAUTHORIZED"))).toBe(true);
    expect(isSignedOutError(problem(403, "ACCOUNT_SUSPENDED"))).toBe(true);
    expect(isSignedOutError(problem(403, "IP_NOT_ALLOWED"))).toBe(true);
    for (const error of [
      problem(403, "RANK_NOT_ALLOWED"),
      problem(403, "CSRF_FAILED"),
      problem(429, "RATE_LIMITED"),
      problem(500, "INTERNAL_ERROR"),
      new Error("x"),
    ]) {
      expect(isSignedOutError(error)).toBe(false);
    }
  });
});

describe("isRankRefusal", () => {
  it("is true only for 403 RANK_NOT_ALLOWED", () => {
    expect(isRankRefusal(problem(403, "RANK_NOT_ALLOWED"))).toBe(true);
    expect(isRankRefusal(problem(403, "ACCOUNT_SUSPENDED"))).toBe(false);
    expect(isRankRefusal(new Error("x"))).toBe(false);
  });
});

describe("leaveIfSignedOut", () => {
  it("forgets the token and refreshes on a signed-out answer", async () => {
    await rememberToken("token-1");
    const router = { refresh: vi.fn() };
    expect(leaveIfSignedOut(problem(401, "UNAUTHORIZED"), router)).toBe(true);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(csrfToken()).toBeUndefined();
  });

  it("refreshes on a rank refusal and keeps the token: it is never a sign-out", async () => {
    await rememberToken("token-2");
    const router = { refresh: vi.fn() };
    expect(leaveIfSignedOut(problem(403, "RANK_NOT_ALLOWED"), router)).toBe(true);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(csrfToken()).toBe("token-2");
  });

  it("does nothing for any other error", async () => {
    await rememberToken("token-3");
    const router = { refresh: vi.fn() };
    for (const error of [
      problem(403, "CSRF_FAILED"),
      problem(500, "INTERNAL_ERROR"),
      problem(429, "RATE_LIMITED"),
      new Error("x"),
    ]) {
      expect(leaveIfSignedOut(error, router)).toBe(false);
    }
    expect(router.refresh).not.toHaveBeenCalled();
    expect(csrfToken()).toBe("token-3");
  });
});
