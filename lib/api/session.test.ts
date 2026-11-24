// The session reader (lib/api/session.ts): which "me" route it asks, when it asks nothing, what counts as signed out, and
// where the require functions send a visitor. The cookie jar, the API call and the redirect are stand-ins.
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

const request = vi.hoisted(() => ({
  cookies: new Set<string>(),
  get: vi.fn(),
}));

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}

// `cache` only deduplicates inside one request: here every call is a request of its own.
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ cookies: async () => ({ has: (name: string) => request.cookies.has(name) }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));
vi.mock("./server", () => ({ apiSessionGet: request.get }));

import { ApiError } from "./errors";
import { getAccount, requireAccount, requireRank, signInPath } from "./session";
import type { AccountMe } from "./types";
import type * as S from "./schema.gen";

function account(kind: "retail" | "merchant"): AccountMe {
  return {
    id: 7,
    name: "Sam",
    email: "sam@example.test",
    status: "active",
    rank: { id: kind === "merchant" ? 3 : 1, name: kind === "merchant" ? "Merchant" : "Retail", kind, discountPercent: "0.00" },
    hasPassword: true,
    mustChangePassword: false,
    twofaEnabled: false,
    currency: "USD",
    marketingOptIn: false,
    company: "",
    username: "",
    phone: "",
    country: "US",
    address: "",
    taxId: "",
    emailVerifiedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  } as AccountMe;
}

function problem(status: number, code: string): ApiError {
  return new ApiError({ status, code });
}

async function redirectOf(run: Promise<unknown>): Promise<string> {
  const error = await run.catch((e: unknown) => e);
  if (!(error instanceof Redirected)) throw new Error("expected a redirect, got " + String(error));
  return error.to;
}

beforeEach(() => {
  request.cookies.clear();
  request.get.mockReset();
});

describe("getAccount", () => {
  it("makes no API call without an account cookie", async () => {
    request.cookies.add("theme");
    expect(await getAccount()).toBeNull();
    expect(request.get).not.toHaveBeenCalled();
  });

  it("asks GET /store/v1/me when only the shop cookie exists", async () => {
    request.cookies.add("csrf_token_store");
    request.get.mockResolvedValue(account("retail"));
    expect(await getAccount()).toMatchObject({ id: 7, rank: { kind: "retail" } });
    expect(request.get).toHaveBeenCalledTimes(1);
    expect(request.get).toHaveBeenCalledWith("/store/v1/me");
  });

  it("asks GET /client/auth/me when the portal cookie exists", async () => {
    request.cookies.add("csrf_token_client");
    request.get.mockResolvedValue(account("merchant"));
    expect(await getAccount()).toMatchObject({ rank: { kind: "merchant" } });
    expect(request.get).toHaveBeenCalledWith("/client/auth/me");
  });

  it("asks the portal route when both cookies exist (the portal name wins)", async () => {
    request.cookies.add("csrf_token_store").add("csrf_token_client");
    request.get.mockResolvedValue(account("merchant"));
    await getAccount();
    expect(request.get).toHaveBeenCalledTimes(1);
    expect(request.get).toHaveBeenCalledWith("/client/auth/me");
  });

  it("gives null for a 401 and for each signed-out code, and never asks twice", async () => {
    request.cookies.add("csrf_token_store");
    for (const error of [
      problem(401, "UNAUTHORIZED"),
      problem(403, "ACCOUNT_SUSPENDED"),
      problem(403, "IP_NOT_ALLOWED"),
      problem(403, "RANK_NOT_ALLOWED"),
    ]) {
      request.get.mockReset();
      request.get.mockRejectedValue(error);
      expect(await getAccount(), error.code).toBeNull();
      expect(request.get).toHaveBeenCalledTimes(1);
    }
  });

  it("throws a server error, a rate limit and an unreadable answer", async () => {
    request.cookies.add("csrf_token_client");
    for (const error of [
      problem(500, "INTERNAL_ERROR"),
      problem(429, "RATE_LIMITED"),
      problem(0, "NETWORK_ERROR"),
      new Error("boom"),
    ]) {
      request.get.mockRejectedValue(error);
      await expect(getAccount()).rejects.toBe(error);
    }
  });

  it("does not treat an unrelated 403 as signed out", async () => {
    request.cookies.add("csrf_token_client");
    const error = problem(403, "CSRF_FAILED");
    request.get.mockRejectedValue(error);
    await expect(getAccount()).rejects.toBe(error);
  });
});

describe("signInPath", () => {
  it("names no account type and keeps a safe next", () => {
    expect(signInPath("/en/account/orders")).toBe("/en/sign-in?next=%2Fen%2Faccount%2Forders");
    expect(signInPath("/en/account/orders?page=2")).toBe("/en/sign-in?next=%2Fen%2Faccount%2Forders%3Fpage%3D2");
    expect(signInPath()).toBe("/en/sign-in");
    expect(signInPath("/en/account")).not.toContain("as=");
  });

  it("drops a next that is not a path of this site", () => {
    for (const next of ["https://evil.example/x", "//evil.example/x", "evil", "", "/\\evil.example"]) {
      expect(signInPath(next), next).toBe("/en/sign-in");
    }
  });
});

describe("requireAccount", () => {
  it("returns the account", async () => {
    request.cookies.add("csrf_token_store");
    request.get.mockResolvedValue(account("retail"));
    expect(await requireAccount("/en/account")).toMatchObject({ id: 7 });
  });

  it("sends a signed-out visitor to the sign-in page, back to next, with no account type", async () => {
    expect(await redirectOf(requireAccount("/en/account/orders"))).toBe("/en/sign-in?next=%2Fen%2Faccount%2Forders");
    expect(request.get).not.toHaveBeenCalled();
  });

  it("sends a visitor whose session ended to the sign-in page", async () => {
    request.cookies.add("csrf_token_client");
    request.get.mockRejectedValue(problem(401, "UNAUTHORIZED"));
    expect(await redirectOf(requireAccount())).toBe("/en/sign-in");
  });
});

describe("requireRank", () => {
  it("returns an account of the asked kind", async () => {
    request.cookies.add("csrf_token_client");
    request.get.mockResolvedValue(account("merchant"));
    expect(await requireRank("merchant", "/en/account/services")).toMatchObject({ rank: { kind: "merchant" } });
  });

  it("sends a retail account that asks for the merchant kind to the account home", async () => {
    request.cookies.add("csrf_token_store");
    request.get.mockResolvedValue(account("retail"));
    expect(await redirectOf(requireRank("merchant", "/en/account/services"))).toBe("/en/account");
  });

  it("sends a merchant account that asks for the retail kind to the account home", async () => {
    request.cookies.add("csrf_token_client");
    request.get.mockResolvedValue(account("merchant"));
    expect(await redirectOf(requireRank("retail"))).toBe("/en/account");
  });

  it("treats a kind it does not know as retail (fails closed)", async () => {
    request.cookies.add("csrf_token_client");
    request.get.mockResolvedValue({
      ...account("merchant"),
      rank: { id: 9, name: "Other", kind: "partner", discountPercent: "0.00" },
    });
    expect(await redirectOf(requireRank("merchant"))).toBe("/en/account");
  });

  it("sends a signed-out visitor to the sign-in page, not to the account home", async () => {
    expect(await redirectOf(requireRank("merchant", "/en/account/services"))).toBe("/en/sign-in?next=%2Fen%2Faccount%2Fservices");
  });
});

describe("AccountMe", () => {
  it('is the one shape of both "me" routes', () => {
    expectTypeOf<S.GetStoreV1MeResponse>().toEqualTypeOf<S.GetClientAuthMeResponse>();
    expectTypeOf<AccountMe>().toEqualTypeOf<S.GetStoreV1MeResponse>();
    expectTypeOf<AccountMe["rank"]["kind"]>().toEqualTypeOf<"retail" | "merchant">();
  });
});
