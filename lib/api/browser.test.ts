import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, csrfToken, forgetCsrf, newIdempotencyKey } from "./browser";
import { isApiError } from "./errors";

type Call = { url: string; init: RequestInit & { headers: Headers } };

function jsonResponse(body: unknown, init: { status?: number; csrf?: string } = {}): Response {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.csrf) headers["x-csrf-token"] = init.csrf;
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

/** Stubs `fetch` with a queue of answers; returns the recorded calls. */
function stubFetch(...answers: Response[]): Call[] {
  const calls: Call[] = [];
  const queue = [...answers];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: Call["init"]) => {
      calls.push({ url, init });
      const next = queue.shift();
      if (!next) throw new Error("unexpected fetch");
      return next;
    }),
  );
  return calls;
}

beforeEach(() => {
  forgetCsrf("client");
  forgetCsrf("store");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api.signIn (smart sign-in, plan D2)", () => {
  it("keeps a customer's CSRF token under `store`, never under `client`", async () => {
    stubFetch(jsonResponse({ kind: "customer", next: "done" }, { csrf: "token-of-customer" }));
    const result = await api.signIn({ email: "a@example.test", password: "secret-password" }, "turnstile-1");
    expect(result).toEqual({ kind: "customer", next: "done" });
    expect(csrfToken("store")).toBe("token-of-customer");
    expect(csrfToken("client")).toBeUndefined();
  });

  it("keeps a merchant's CSRF token under `client`, never under `store`", async () => {
    stubFetch(jsonResponse({ kind: "merchant", next: "totp" }, { csrf: "token-of-merchant" }));
    const result = await api.signIn({ email: "m@example.test", password: "secret-password" }, "turnstile-2");
    expect(result).toEqual({ kind: "merchant", next: "totp" });
    expect(csrfToken("client")).toBe("token-of-merchant");
    expect(csrfToken("store")).toBeUndefined();
  });

  it("keeps the token for the password step too (a merchant on `password` needs it for /client/auth/password/change)", async () => {
    stubFetch(jsonResponse({ kind: "merchant", next: "password" }, { csrf: "token-pending" }));
    await api.signIn({ email: "m@example.test", password: "temporary-password" }, "t");
    expect(csrfToken("client")).toBe("token-pending");
  });

  it("does not overwrite the token of the other area when someone signs in as the other kind", async () => {
    stubFetch(
      jsonResponse({ next: "done" }, { csrf: "merchant-1" }), // POST /client/auth/login: stored under `client` by its path
      jsonResponse({ kind: "customer", next: "done" }, { csrf: "customer-1" }), // smart sign-in as a customer
    );
    await api.post("/client/auth/login", { email: "m@example.test", password: "x" });
    expect(csrfToken("client")).toBe("merchant-1");
    await api.signIn({ email: "c@example.test", password: "secret-password" }, "t");
    expect(csrfToken("client")).toBe("merchant-1");
    expect(csrfToken("store")).toBe("customer-1");
  });

  it("posts the form to /client/auth/sign-in with the Turnstile token and no CSRF token", async () => {
    // A merchant token is remembered, and must not be sent to the pre-auth route.
    const calls = stubFetch(
      jsonResponse({ next: "done" }, { csrf: "merchant-1" }),
      jsonResponse({ kind: "customer", next: "done" }, { csrf: "customer-1" }),
    );
    await api.post("/client/auth/login", { email: "m@example.test", password: "x" });
    await api.signIn({ email: "c@example.test", password: "secret-password" }, "turnstile-3");
    const { url, init } = calls[1];
    expect(url).toBe("/client/auth/sign-in");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers.get("X-Turnstile-Token")).toBe("turnstile-3");
    expect(init.headers.get("Content-Type")).toBe("application/json");
    expect(init.headers.has("X-CSRF-Token")).toBe(false);
    expect(init.headers.has("Idempotency-Key")).toBe(false);
    expect(JSON.parse(String(init.body))).toEqual({ email: "c@example.test", password: "secret-password" });
  });

  it("answers a wrong email or password with one ApiError (401 UNAUTHORIZED) and stores nothing", async () => {
    stubFetch(jsonResponse({ code: "UNAUTHORIZED", status: 401, title: "Authentication failed." }, { status: 401 }));
    const error = await api.signIn({ email: "nobody@example.test", password: "nope-nope-nope" }, "t").catch((e: unknown) => e);
    expect(isApiError(error)).toBe(true);
    expect(error).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(csrfToken("client")).toBeUndefined();
    expect(csrfToken("store")).toBeUndefined();
  });

  it("refuses an answer without a known kind and keeps no token", async () => {
    stubFetch(jsonResponse({ next: "done" }, { csrf: "unclaimed" }));
    await expect(api.signIn({ email: "a@example.test", password: "x" }, "t")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(csrfToken("client")).toBeUndefined();
    expect(csrfToken("store")).toBeUndefined();
  });

  it("surfaces a failed anti-bot check as TURNSTILE_FAILED", async () => {
    stubFetch(jsonResponse({ code: "TURNSTILE_FAILED", status: 403 }, { status: 403 }));
    await expect(api.signIn({ email: "a@example.test", password: "x" }, "bad")).rejects.toMatchObject({
      status: 403,
      code: "TURNSTILE_FAILED",
    });
  });
});

describe("the CSRF rules of every other call are unchanged", () => {
  it("stores the answer's token by the path's surface and sends it back on the next non-GET", async () => {
    const calls = stubFetch(
      jsonResponse({ next: "done" }, { csrf: "merchant-1" }),
      jsonResponse({ next: "done" }, { csrf: "customer-1" }),
      jsonResponse({ ok: true }),
      jsonResponse({ ok: true }),
    );
    await api.post("/client/auth/login", { email: "m@example.test", password: "x" });
    await api.post("/store/v1/auth/login", { email: "c@example.test", password: "x" }, { turnstileToken: "t" });
    expect(csrfToken("client")).toBe("merchant-1");
    expect(csrfToken("store")).toBe("customer-1");

    await api.post("/client/orders", { serviceId: 1 });
    await api.post("/store/v1/me/wallet/top-ups", { amount: "25", gatewayId: 3 }, { idempotencyKey: "key-1" });
    expect(calls[2].init.headers.get("X-CSRF-Token")).toBe("merchant-1");
    expect(calls[3].init.headers.get("X-CSRF-Token")).toBe("customer-1");
    expect(calls[3].init.headers.get("Idempotency-Key")).toBe("key-1");
  });

  it("sends no CSRF token on a GET and no Content-Type without a body", async () => {
    const calls = stubFetch(jsonResponse({ next: "done" }, { csrf: "merchant-1" }), jsonResponse({}), jsonResponse({}));
    await api.post("/client/auth/login", { email: "m@example.test", password: "x" });
    await api.get("/client/auth/me");
    await api.post("/client/auth/logout");
    expect(calls[1].init.headers.has("X-CSRF-Token")).toBe(false);
    expect(calls[2].init.headers.get("X-CSRF-Token")).toBe("merchant-1");
    expect(calls[2].init.headers.has("Content-Type")).toBe(false);
  });
});

describe("newIdempotencyKey", () => {
  it("is still exported from the browser client for older imports", () => {
    expect(newIdempotencyKey()).toMatch(/^[\x21-\x7e]{1,100}$/);
  });
});
