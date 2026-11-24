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

/** The page's cookie string, as the browser would hand it out (`document.cookie`). */
function stubCookies(cookie: string): void {
  vi.stubGlobal("document", { cookie });
}

beforeEach(() => {
  forgetCsrf();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api.signIn (the one sign-in form)", () => {
  it("accepts an answer with a step and no kind, and remembers its token", async () => {
    stubFetch(jsonResponse({ next: "done" }, { csrf: "token-1" }));
    const result = await api.signIn({ email: "a@example.test", password: "secret-password" }, "turnstile-1");
    expect(result).toEqual({ next: "done" });
    expect(csrfToken()).toBe("token-1");
  });

  it("passes the rank of the answer on and reads no kind word", async () => {
    const rank = { id: 2, name: "Retail", kind: "retail" };
    stubFetch(jsonResponse({ next: "totp", rank }, { csrf: "token-2" }));
    const result = await api.signIn({ email: "a@example.test", password: "secret-password" }, "t");
    expect(result).toEqual({ next: "totp", rank });
    expect(csrfToken()).toBe("token-2");
  });

  it("keeps the token for the password step too (the forced change needs it)", async () => {
    stubFetch(jsonResponse({ next: "password" }, { csrf: "token-pending" }));
    await api.signIn({ email: "m@example.test", password: "temporary-password" }, "t");
    expect(csrfToken()).toBe("token-pending");
  });

  it("refuses a step it does not know and keeps no token", async () => {
    stubFetch(jsonResponse({ next: "x" }, { csrf: "unclaimed" }));
    await expect(api.signIn({ email: "a@example.test", password: "x" }, "t")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(csrfToken()).toBeUndefined();
  });

  it("refuses an answer without a step and an empty answer", async () => {
    stubFetch(
      jsonResponse({ kind: "customer" }, { csrf: "unclaimed" }),
      new Response(null, { status: 204, headers: { "x-csrf-token": "empty" } }),
    );
    await expect(api.signIn({ email: "a@example.test", password: "x" }, "t")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(api.signIn({ email: "a@example.test", password: "x" }, "t")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(csrfToken()).toBeUndefined();
  });

  it("replaces the token of an earlier session with the new one", async () => {
    stubFetch(jsonResponse({ next: "done" }, { csrf: "first" }), jsonResponse({ next: "done" }, { csrf: "second" }));
    await api.signIn({ email: "a@example.test", password: "x" }, "t");
    await api.signIn({ email: "b@example.test", password: "x" }, "t");
    expect(csrfToken()).toBe("second");
  });

  it("posts the form to /client/auth/sign-in with the Turnstile token and sends the token it has", async () => {
    const calls = stubFetch(jsonResponse({ next: "done" }, { csrf: "old" }), jsonResponse({ next: "done" }, { csrf: "new" }));
    await api.post("/client/orders", { serviceId: 1 }); // learns "old" from the answer's header
    await api.signIn({ email: "c@example.test", password: "secret-password" }, "turnstile-3");
    const { url, init } = calls[1];
    expect(url).toBe("/client/auth/sign-in");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers.get("X-Turnstile-Token")).toBe("turnstile-3");
    expect(init.headers.get("Content-Type")).toBe("application/json");
    expect(init.headers.get("X-CSRF-Token")).toBe("old");
    expect(init.headers.has("Idempotency-Key")).toBe(false);
    expect(JSON.parse(String(init.body))).toEqual({ email: "c@example.test", password: "secret-password" });
  });

  it("answers a wrong email or password with one ApiError (401 UNAUTHORIZED) and stores nothing", async () => {
    stubFetch(jsonResponse({ code: "UNAUTHORIZED", status: 401, title: "Authentication failed." }, { status: 401 }));
    const error = await api.signIn({ email: "nobody@example.test", password: "nope-nope-nope" }, "t").catch((e: unknown) => e);
    expect(isApiError(error)).toBe(true);
    expect(error).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(csrfToken()).toBeUndefined();
  });

  it("surfaces a failed anti-bot check as TURNSTILE_FAILED", async () => {
    stubFetch(jsonResponse({ code: "TURNSTILE_FAILED", status: 403 }, { status: 403 }));
    await expect(api.signIn({ email: "a@example.test", password: "x" }, "bad")).rejects.toMatchObject({
      status: 403,
      code: "TURNSTILE_FAILED",
    });
  });
});

describe("one CSRF token for both families of routes", () => {
  it("sends the same token on a /client and a /store/v1 mutation", async () => {
    const calls = stubFetch(
      jsonResponse({ next: "done" }, { csrf: "token-1" }),
      jsonResponse({ ok: true }),
      jsonResponse({ ok: true }),
    );
    await api.signIn({ email: "a@example.test", password: "x" }, "t");
    await api.post("/client/orders", { serviceId: 1 });
    await api.post("/store/v1/me/wallet/top-ups", { amount: "25", gatewayId: 3 }, { idempotencyKey: "key-1" });
    expect(calls[1].init.headers.get("X-CSRF-Token")).toBe("token-1");
    expect(calls[2].init.headers.get("X-CSRF-Token")).toBe("token-1");
    expect(calls[2].init.headers.get("Idempotency-Key")).toBe("key-1");
  });

  it("sends the token of the shop cookie on a /client request", async () => {
    stubCookies("theme=dark; csrf_token_store=from-the-shop-cookie");
    const calls = stubFetch(jsonResponse({ ok: true }));
    await api.post("/client/orders", { serviceId: 1 });
    expect(calls[0].init.headers.get("X-CSRF-Token")).toBe("from-the-shop-cookie");
  });

  it("sends the token of the portal cookie on a /store/v1 request, and the portal cookie wins when both exist", async () => {
    stubCookies("csrf_token_store=shop; csrf_token_client=portal");
    const calls = stubFetch(jsonResponse({ ok: true }));
    await api.patch("/store/v1/me", { name: "Sam" });
    expect(calls[0].init.headers.get("X-CSRF-Token")).toBe("portal");
  });

  it("prefers the readable cookie to the remembered header", async () => {
    stubCookies("csrf_token_client=cookie");
    stubFetch(jsonResponse({}, { csrf: "header" }));
    await api.get("/client/auth/me");
    expect(csrfToken()).toBe("cookie");
  });

  it("remembers the token of any answer of either family, and forgets it on request", async () => {
    stubFetch(jsonResponse({}, { csrf: "from-client" }), jsonResponse({}, { csrf: "from-store" }));
    await api.get("/client/auth/me");
    expect(csrfToken()).toBe("from-client");
    await api.get("/store/v1/me");
    expect(csrfToken()).toBe("from-store");
    forgetCsrf();
    expect(csrfToken()).toBeUndefined();
  });

  it("keeps the token of a failed answer too (a refused write still tells the token)", async () => {
    stubFetch(jsonResponse({ code: "RANK_NOT_ALLOWED", status: 403 }, { status: 403, csrf: "kept" }));
    await expect(api.post("/client/orders", {})).rejects.toMatchObject({ status: 403, code: "RANK_NOT_ALLOWED" });
    expect(csrfToken()).toBe("kept");
  });

  it("sends no token on a GET, none on a path outside both prefixes, and no Content-Type without a body", async () => {
    stubCookies("csrf_token_client=portal");
    const calls = stubFetch(jsonResponse({}), jsonResponse({}), jsonResponse({}));
    await api.get("/client/auth/me");
    await api.post("/other/route", {});
    await api.post("/client/auth/logout");
    expect(calls[0].init.headers.has("X-CSRF-Token")).toBe(false);
    expect(calls[1].init.headers.has("X-CSRF-Token")).toBe(false);
    expect(calls[2].init.headers.get("X-CSRF-Token")).toBe("portal");
    expect(calls[2].init.headers.has("Content-Type")).toBe(false);
  });
});

describe("newIdempotencyKey", () => {
  it("is still exported from the browser client for older imports", () => {
    expect(newIdempotencyKey()).toMatch(/^[\x21-\x7e]{1,100}$/);
  });
});
