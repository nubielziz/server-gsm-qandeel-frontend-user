import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, csrfToken, forgetCsrf } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import {
  changeTemporaryPassword,
  exchangeSignInLink,
  finishSignUp,
  requestPasswordLink,
  requestSignInLink,
  requestSignUp,
  setPasswordFromLink,
  submitTotpCode,
  verifyEmailAddress,
} from "./auth-requests";

type Call = { url: string; method: string; headers: Headers; body: unknown };

function json(body: unknown, init: { status?: number; csrf?: string } = {}): Response {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.csrf) headers["x-csrf-token"] = init.csrf;
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}
const empty = () => new Response(null, { status: 204 });
const problem = (status: number, code: string) =>
  new Response(JSON.stringify({ type: "about:blank", title: code, status, code, requestId: "req-1" }), {
    status,
    headers: { "content-type": "application/problem+json" },
  });

/** Stubs `fetch` with a queue of answers and returns what was sent. */
function stubFetch(...answers: Response[]): Call[] {
  const calls: Call[] = [];
  const queue = [...answers];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit & { headers: Headers }) => {
      calls.push({
        url,
        method: init.method ?? "GET",
        headers: init.headers,
        body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
      });
      const next = queue.shift();
      if (!next) throw new Error("unexpected fetch");
      return next;
    }),
  );
  return calls;
}

beforeEach(() => forgetCsrf());
afterEach(() => vi.unstubAllGlobals());

describe("the sign-in link: the claim box rides on the exchange", () => {
  const answer = { next: "done", claimedOrders: 0 };

  it("posts the token and the ticked box to the one link route", async () => {
    const calls = stubFetch(json(answer, { csrf: "t-1" }));
    await exchangeSignInLink("link-token", true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/store/v1/auth/verify");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toEqual({ token: "link-token", claimGuestOrders: true });
  });

  it("posts false when the box was cleared, never leaves the key out", async () => {
    const calls = stubFetch(json(answer));
    await exchangeSignInLink("link-token", false);
    expect(calls[0].body).toEqual({ token: "link-token", claimGuestOrders: false });
  });

  it("returns the step and the outcome of the claim, and keeps the CSRF token of the session it opened", async () => {
    stubFetch(json({ ...answer, next: "totp", claimedOrders: 2, claimSkipped: "busy" }, { csrf: "t-2" }));
    expect(await exchangeSignInLink("x", true)).toEqual({
      next: "totp",
      claimedOrders: 2,
      claimSkipped: "busy",
      requestedHere: false,
      maskedEmail: "",
    });
    expect(csrfToken()).toBe("t-2");
  });

  it("returns whose account the link opened, and whether this browser asked for the link", async () => {
    stubFetch(json({ ...answer, requestedHere: false, maskedEmail: "da•••@example.com" }));
    expect(await exchangeSignInLink("x", true)).toEqual({
      next: "done",
      claimedOrders: 0,
      requestedHere: false,
      maskedEmail: "da•••@example.com",
    });
    stubFetch(json({ ...answer, requestedHere: true, maskedEmail: "da•••@example.com" }));
    expect(await exchangeSignInLink("x", true)).toMatchObject({ requestedHere: true, maskedEmail: "da•••@example.com" });
  });

  it("leaves claimSkipped out when the answer has none, and counts a missing claimedOrders as 0", async () => {
    stubFetch(json({ next: "done" }));
    expect(await exchangeSignInLink("x", true)).toEqual({ next: "done", claimedOrders: 0, requestedHere: false, maskedEmail: "" });
  });

  it("passes on whether the password of a sign-up was set, only when the answer says it", async () => {
    stubFetch(json({ ...answer, passwordSet: false }));
    expect(await exchangeSignInLink("x", true)).toMatchObject({ passwordSet: false });
    stubFetch(json({ ...answer, passwordSet: true }));
    expect(await exchangeSignInLink("x", true)).toMatchObject({ passwordSet: true });
    // A link of any other kind has no such key: it stays out of the result (the page says nothing about a password).
    stubFetch(json(answer));
    expect(await exchangeSignInLink("x", true)).not.toHaveProperty("passwordSet");
    stubFetch(json({ ...answer, passwordSet: "no" }));
    expect(await exchangeSignInLink("x", true)).not.toHaveProperty("passwordSet");
  });

  it("hands on the details of a sign-up link opened in another browser, never anything else of them", async () => {
    const pendingDetails = { firstName: "Sam", lastName: "Hamdan", country: "JO", phone: "+962791234567" };
    stubFetch(json({ ...answer, passwordSet: false, pendingDetails: { ...pendingDetails, password: "leaked", extra: 1 } }));
    const result = await exchangeSignInLink("x", true);
    expect(result).toMatchObject({ passwordSet: false, pendingDetails });
    expect(JSON.stringify(result)).not.toContain("leaked");
    // Malformed details are dropped, not guessed.
    stubFetch(json({ ...answer, passwordSet: false, pendingDetails: { firstName: "Sam" } }));
    expect(await exchangeSignInLink("x", true)).not.toHaveProperty("pendingDetails");
    stubFetch(json({ ...answer, passwordSet: false, pendingDetails: "Sam" }));
    expect(await exchangeSignInLink("x", true)).not.toHaveProperty("pendingDetails");
    // A link of any other kind has no such key.
    stubFetch(json(answer));
    expect(await exchangeSignInLink("x", true)).not.toHaveProperty("pendingDetails");
  });

  it("refuses an answer with no known step", async () => {
    stubFetch(json({ next: "password", claimedOrders: 0 }));
    await expect(exchangeSignInLink("x", true)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    stubFetch(new Response(null, { status: 204 }));
    await expect(exchangeSignInLink("x", true)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("a spent link is a 410 the page shows as expired", async () => {
    stubFetch(problem(410, "TOKEN_INVALID"));
    const error = await exchangeSignInLink("x", true).catch((e: unknown) => e);
    expect(isApiError(error) && error.status).toBe(410);
  });
});

describe("asking for a link", () => {
  it("the sign-in email link: one route, the Turnstile token, only the email", async () => {
    const calls = stubFetch(empty());
    await requestSignInLink("a@example.test", "ts-token");
    expect(calls[0].url).toBe("/store/v1/auth/magic-link");
    expect(calls[0].headers.get("x-turnstile-token")).toBe("ts-token");
    expect(calls[0].body).toEqual({ email: "a@example.test" });
  });

  it("the forgotten password: exactly one POST to the shared route with the Turnstile token and no account type", async () => {
    const calls = stubFetch(empty());
    await requestPasswordLink("a@example.test", "ts-token");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/client/auth/password/forgot");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.get("x-turnstile-token")).toBe("ts-token");
    expect(calls[0].body).toEqual({ email: "a@example.test" });
  });
});

describe("the sign-up", () => {
  const body = {
    email: "a@example.test",
    password: "Orchard-Lantern-8841",
    firstName: "Sam",
    lastName: "Hamdan",
    country: "JO",
    phone: "+962791234567",
  };

  it("posts every detail to the sign-up route, with the Turnstile token and the CSRF handling of the other sign-in routes", async () => {
    const calls = stubFetch(empty());
    await requestSignUp(body, "ts-token");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/store/v1/auth/sign-up");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.get("x-turnstile-token")).toBe("ts-token");
    expect(calls[0].headers.get("content-type")).toBe("application/json");
    expect(calls[0].body).toEqual(body);
  });

  it("answers nothing for a 204 and keeps the field errors of a 422 on the error", async () => {
    stubFetch(empty());
    await expect(requestSignUp(body, "t")).resolves.toBeUndefined();
    stubFetch(
      new Response(
        JSON.stringify({
          type: "about:blank",
          title: "Validation failed",
          status: 422,
          code: "VALIDATION_FAILED",
          errors: [{ field: "password", code: "WEAK_PASSWORD", message: "Too weak." }],
        }),
        { status: 422, headers: { "content-type": "application/problem+json" } },
      ),
    );
    const error = await requestSignUp(body, "t").catch((e: unknown) => e);
    expect(isApiError(error) && error.status).toBe(422);
    expect(isApiError(error) && error.fieldError("password")?.code).toBe("WEAK_PASSWORD");
    stubFetch(problem(429, "RATE_LIMITED"));
    expect(await requestSignUp(body, "t").catch((e: unknown) => isApiError(e) && e.status)).toBe(429);
  });
});

describe("the password link and the email link", () => {
  it("the password link posts the token and the password to the shared reset route", async () => {
    const calls = stubFetch(empty());
    await setPasswordFromLink("tok", "Orchard-Lantern-8841");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/client/auth/password/reset");
    expect(calls[0].body).toEqual({ token: "tok", password: "Orchard-Lantern-8841" });
  });

  it("a weak password stays a 422 on the field and a spent link a 410", async () => {
    stubFetch(problem(422, "VALIDATION_FAILED"));
    expect(await setPasswordFromLink("t", "p").catch((e: unknown) => isApiError(e) && e.status)).toBe(422);
    stubFetch(problem(410, "TOKEN_INVALID"));
    expect(await setPasswordFromLink("t", "p").catch((e: unknown) => isApiError(e) && e.status)).toBe(410);
  });

  it("the email link posts the token to the verify route and makes no other call: it signs nobody in", async () => {
    const calls = stubFetch(empty());
    await verifyEmailAddress("tok");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/client/auth/verify-email");
    expect(calls[0].body).toEqual({ token: "tok" });
    expect(calls.map((call) => call.url)).not.toContain("/store/v1/auth/verify");
  });
});

describe("the steps after the password", () => {
  it("the code goes to the shared two-step route, with the token of the pending session", async () => {
    const calls = stubFetch(json({ next: "totp" }, { csrf: "pending-token" }), empty());
    await api.signIn({ email: "a@example.test", password: "secret-password" }, "ts");
    await submitTotpCode("123456");
    expect(calls[1].url).toBe("/client/auth/2fa");
    expect(calls[1].body).toEqual({ code: "123456" });
    expect(calls[1].headers.get("x-csrf-token")).toBe("pending-token");
  });

  it("a wrong code is a 422 and an ended pending session a 401", async () => {
    stubFetch(problem(422, "VALIDATION_FAILED"));
    expect(await submitTotpCode("000000").catch((e: unknown) => isApiError(e) && e.status)).toBe(422);
    stubFetch(problem(401, "UNAUTHORIZED"));
    expect(await submitTotpCode("000000").catch((e: unknown) => isApiError(e) && e.status)).toBe(401);
  });

  it("the new password posts only {password} to the forced-change route and returns the step its answer names", async () => {
    const calls = stubFetch(json({ next: "totp" }), json({ next: "done" }));
    expect(await changeTemporaryPassword("Willow-Anchor-7304")).toBe("totp");
    expect(await changeTemporaryPassword("Willow-Anchor-7304")).toBe("done");
    expect(calls.map((call) => call.url)).toEqual(["/client/auth/password/change", "/client/auth/password/change"]);
    expect(calls[0].body).toEqual({ password: "Willow-Anchor-7304" });
    expect(calls[0].method).toBe("POST");
  });

  it("refuses a password answer with no known step", async () => {
    stubFetch(json({ next: "password" }));
    await expect(changeTemporaryPassword("p")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    stubFetch(empty());
    await expect(changeTemporaryPassword("p")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

describe("finishing a sign-up that a link made in another browser", () => {
  const body = { firstName: "Sam", lastName: "Hamdan", country: "JO", phone: "+962791234567", password: "Orchard-Lantern-8841" };

  it("posts the four details and the password to the finish route with the session's CSRF token, and no Turnstile token", async () => {
    // The session's token comes from the answer of the exchange that opened it.
    stubFetch(json({ next: "done", claimedOrders: 0 }, { csrf: "t-9" }));
    await exchangeSignInLink("x", true);
    const calls = stubFetch(json({ id: 1, email: "sam@example.com" }));
    const me = await finishSignUp(body);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/store/v1/auth/sign-up/finish");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toEqual(body);
    expect(calls[0].headers.get("x-csrf-token")).toBe("t-9");
    expect(calls[0].headers.get("x-turnstile-token")).toBeNull();
    expect(me).toMatchObject({ email: "sam@example.com" });
  });

  it("throws the ApiError of a refused call: 422 with its fields, 409 for an account that has a password", async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          type: "about:blank",
          title: "x",
          status: 422,
          code: "VALIDATION_FAILED",
          errors: [{ field: "password", code: "WEAK_PASSWORD", message: "Too weak." }],
        }),
        { status: 422, headers: { "content-type": "application/problem+json" } },
      ),
    );
    const refused = await finishSignUp(body).catch((e: unknown) => e);
    expect(isApiError(refused) && refused.status).toBe(422);
    expect(isApiError(refused) && refused.fieldError("password")?.code).toBe("WEAK_PASSWORD");
    stubFetch(problem(409, "CONFLICT"));
    const conflict = await finishSignUp(body).catch((e: unknown) => e);
    expect(isApiError(conflict) && conflict.status).toBe(409);
  });
});
