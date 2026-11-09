// Routing layer: language redirects (email links must keep working), optimistic sign-in redirects and the API
// rewrites. HTTP-level checks, no UI.
import { expect, test } from "@playwright/test";

test.describe("language routing", () => {
  test("a path without a language goes to the visitor's language and keeps the query", async ({ request }) => {
    const en = await request.get("/sign-in?token=abc", { maxRedirects: 0, headers: { "accept-language": "en-GB,en;q=0.9" } });
    expect(en.status()).toBe(307);
    expect(en.headers()["location"]).toMatch(/\/en\/sign-in\?token=abc$/);

    const ar = await request.get("/merchant/set-password?token=xyz", {
      maxRedirects: 0,
      headers: { "accept-language": "ar-JO,ar;q=0.9,en;q=0.5" },
    });
    expect(ar.headers()["location"]).toMatch(/\/ar\/merchant\/set-password\?token=xyz$/);
  });

  test("the language cookie wins over Accept-Language", async ({ request }) => {
    const res = await request.get("/support/tickets/t_abc", {
      maxRedirects: 0,
      headers: { "accept-language": "en", cookie: "gsm_locale=ar" },
    });
    expect(res.headers()["location"]).toMatch(/\/ar\/support\/tickets\/t_abc$/);
  });
});

test.describe("private areas", () => {
  test("account and merchant portal redirect to sign-in without a session", async ({ request }) => {
    const account = await request.get("/en/account/orders", { maxRedirects: 0 });
    expect(account.status()).toBe(307);
    const to = new URL(account.headers()["location"], "http://x");
    expect(to.pathname).toBe("/en/sign-in");
    expect(to.searchParams.get("as")).toBe("customer");
    expect(to.searchParams.get("next")).toBe("/en/account/orders");

    const merchant = await request.get("/ar/merchant/orders", { maxRedirects: 0 });
    expect(new URL(merchant.headers()["location"], "http://x").searchParams.get("as")).toBe("merchant");
  });

  test("merchant email-link pages stay public", async ({ request }) => {
    for (const path of ["/en/merchant/register?ref=ABC", "/en/merchant/set-password?token=t", "/en/merchant/verify-email?token=t"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).not.toBe(307);
    }
  });
});

test.describe("API rewrites", () => {
  test("/store/v1 reaches the API on the site's origin", async ({ request }) => {
    const res = await request.get("/store/v1/config");
    expect(res.status()).toBe(200);
    expect((await res.json()).baseCurrency).toBe("USD");
  });

  test("/client answers 401 without a session (problem+json)", async ({ request }) => {
    const res = await request.get("/client/auth/me");
    expect(res.status()).toBe(401);
    expect(res.headers()["content-type"]).toContain("application/problem+json");
    expect((await res.json()).code).toBe("UNAUTHORIZED");
  });
});
