// The e2e harness itself (API only, no page is opened): the demo data the global setup promises (e2e/global-setup.ts), the
// shared helpers (e2e/helpers.ts) and the staff helpers (e2e/admin.ts). Every later spec leans on these, so this one runs
// first on a new build: `E2E_RUN=$(date +%s) E2E_BASE_URL=http://localhost:5176 npx playwright test e2e/harness.spec.ts --project=desktop`.
// Calls go through the site (its /store/v1 and /client rewrites), as the browser's would; staff calls go straight to the
// API (the admin allow-list is loopback). Accounts that change are throwaway ones.
import { randomUUID } from "node:crypto";
import { type APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  approveMerchant,
  availableCodes,
  base32Decode,
  completeOrder,
  creditCustomer,
  creditMerchant,
  customerIdByEmail,
  freezeCustomerWallet,
  merchantIdByEmail,
  normalizeRule,
  quantityMatches,
  sendCampaign,
  serviceIdByCode,
  splitMoney,
  staffApiKeyFor,
  temporaryCustomerPassword,
  temporaryMerchantPassword,
  toMoney4,
  totp,
  unfreezeCustomerWallet,
} from "./admin";
import { BASE_URL, DEV_TURNSTILE_TOKEN, fixtures, freshCustomer, freshMerchant, signInCustomer, signInMerchant } from "./helpers";

// API only: one project is enough (the setup, the accounts and the campaign are the same on both).
test.skip(({ isMobile }) => isMobile, "API only: the desktop project is enough");

const siteOrigin = new URL(BASE_URL).origin;

/** GET through the site; the answer must be 200. */
async function getJson<T>(request: APIRequestContext, path: string): Promise<T> {
  const res = await request.get(path);
  expect(res.status(), `${path}: ${await res.text()}`).toBe(200);
  return (await res.json()) as T;
}

interface ServicePage {
  id: number;
  availability: "in_stock" | "on_request";
  imageUrl: string | null;
  quantity: { min: number; max: number; options: number[] };
}

test.describe("demo data from the global setup", () => {
  test("the fixtures file names the gateway and five services", () => {
    const f = fixtures();
    expect(f.gatewayId).toBeGreaterThan(0);
    for (const service of [f.range, f.packs, f.exact, f.stocked, f.pictured]) {
      expect(service.id).toBeGreaterThan(0);
      expect(service.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  test("the three quantity rules read back from the store", async ({ request }) => {
    const f = fixtures();
    const range = await getJson<ServicePage>(request, `/store/v1/services/${f.range.slug}`);
    expect(range.id).toBe(f.range.id);
    expect(range.quantity).toEqual({ min: 2, max: 50, options: [] });

    const packs = await getJson<ServicePage>(request, `/store/v1/services/${f.packs.slug}`);
    expect(packs.id).toBe(f.packs.id);
    expect(packs.quantity).toEqual({ min: 5, max: 25, options: [5, 10, 25] });

    const exact = await getJson<ServicePage>(request, `/store/v1/services/${f.exact.slug}`);
    expect(exact.id).toBe(f.exact.id);
    expect(exact.quantity).toEqual({ min: 5, max: 5, options: [] });
  });

  test("the stocked service reads in_stock and has codes; the merchant service has enough for merchant.spec", async ({ request }) => {
    const f = fixtures();
    const stocked = await getJson<ServicePage>(request, `/store/v1/services/${f.stocked.slug}`);
    expect(stocked.availability).toBe("in_stock");
    // Stock goes down while specs sell codes (the setup tops it up again), so check that it is there, not the top-up target.
    expect(await availableCodes(f.stocked.id)).toBeGreaterThan(0);
    expect(await availableCodes(await serviceIdByCode("SRV-Z3X-10"))).toBeGreaterThanOrEqual(2); // merchant.spec sells one per project
  });

  test("the store config lists JOD with two decimals", async ({ request }) => {
    const config = await getJson<{ currencies: { code: string; decimals: number }[] }>(request, "/store/v1/config");
    expect(config.currencies.find((c) => c.code === "JOD")).toMatchObject({ code: "JOD", decimals: 2 });
  });

  test("the pictured listing has a picture that the store serves", async ({ request }) => {
    const f = fixtures();
    const page = await getJson<ServicePage>(request, `/store/v1/services/${f.pictured.slug}`);
    expect(page.imageUrl).toMatch(/^\/store\/v1\/media\/[0-9a-f]{64}\.(jpg|png|webp)$/);
    const image = await request.get(page.imageUrl as string);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toMatch(/^image\//);
  });

  test("the customer wallet is on and offers the manual gateway", async ({ page }) => {
    await freshCustomer(page);
    const wallet = await getJson<{ enabled: boolean; balance: string }>(page.request, "/store/v1/me/wallet");
    expect(wallet.enabled).toBe(true);
    expect(wallet.balance).toBe("0.0000");
    const methods = await getJson<{ id: number; kind: string }[]>(page.request, "/store/v1/me/wallet/top-up-methods");
    expect(methods).toContainEqual(expect.objectContaining({ id: fixtures().gatewayId, kind: "manual" }));
  });
});

test.describe("helpers", () => {
  test("freshCustomer signs a new customer in, with or without a password", async ({ page }) => {
    const email = await freshCustomer(page);
    const me = await getJson<{ email: string; hasPassword: boolean }>(page.request, "/store/v1/me");
    expect(me).toMatchObject({ email, hasPassword: false });

    const password = "Willow-Anchor-7304";
    const second = await freshCustomer(page, password);
    expect(second).not.toBe(email);
    expect((await getJson<{ email: string; hasPassword: boolean }>(page.request, "/store/v1/me"))).toMatchObject({ email: second, hasPassword: true });

    await page.context().clearCookies();
    expect((await page.request.get("/store/v1/me")).status()).toBe(401);
    expect(await signInCustomer(page, { email: second, password })).not.toBe("");
    expect((await page.request.get("/store/v1/me")).status()).toBe(200);
  });

  test("freshMerchant registers a pending merchant; staff approve it; verify follows the email link", async ({ page }) => {
    const { email, password } = await freshMerchant(page);
    expect(await signInMerchant(page, { email, password })).not.toBe("");
    const pending = await getJson<{ status: string; emailVerifiedAt: string | null }>(page.request, "/client/auth/me");
    expect(pending).toMatchObject({ status: "pending", emailVerifiedAt: null });

    const id = await merchantIdByEmail(email);
    await approveMerchant(id);
    await approveMerchant(id); // an active merchant is left alone
    expect((await getJson<{ status: string }>(page.request, "/client/auth/me")).status).toBe("active");

    const verified = await freshMerchant(page, { verify: true });
    await signInMerchant(page, verified);
    expect((await getJson<{ emailVerifiedAt: string | null }>(page.request, "/client/auth/me")).emailVerifiedAt).not.toBeNull();
  });

  test("staff credit, freeze and unfreeze a customer's balance", async ({ page }) => {
    const email = await freshCustomer(page);
    const id = await customerIdByEmail(email);
    expect(await creditCustomer(id, "20")).toBe("20.0000");
    expect(await creditCustomer(id, 5.5)).toBe("25.5000");
    let wallet = await getJson<{ balance: string; available: string; frozen: unknown }>(page.request, "/store/v1/me/wallet");
    expect(wallet).toMatchObject({ balance: "25.5000", available: "25.5000", frozen: null });

    await freezeCustomerWallet(id);
    wallet = await getJson(page.request, "/store/v1/me/wallet");
    expect(wallet.frozen).not.toBeNull();
    expect(wallet.balance).toBe("25.5000");

    await unfreezeCustomerWallet(id);
    wallet = await getJson(page.request, "/store/v1/me/wallet");
    expect(wallet).toMatchObject({ balance: "25.5000", available: "25.5000", frozen: null });
  });

  test("a temporary password makes the next sign-in ask for a new one", async ({ page }) => {
    const { email, password } = await freshMerchant(page);
    const temporary = await temporaryMerchantPassword(await merchantIdByEmail(email));
    expect(temporary).not.toBe(password);
    const merchant = await page.request.post("/client/auth/login", {
      headers: { Origin: siteOrigin, "X-Turnstile-Token": DEV_TURNSTILE_TOKEN, "Content-Type": "application/json" },
      data: { email, password: temporary },
    });
    expect(merchant.status(), await merchant.text()).toBe(200);
    expect((await merchant.json()).next).toBe("password");

    const customerEmail = await freshCustomer(page);
    const customerTemporary = await temporaryCustomerPassword(await customerIdByEmail(customerEmail));
    await page.context().clearCookies();
    const customer = await page.request.post("/store/v1/auth/login", {
      headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN, "Content-Type": "application/json" },
      data: { email: customerEmail, password: customerTemporary },
    });
    expect(customer.status(), await customer.text()).toBe(200);
    expect((await customer.json()).next).toBe("password");
  });

  test("staff make an API key for a merchant and complete the merchant's order", async ({ page }) => {
    const { email, password } = await freshMerchant(page);
    const merchantId = await merchantIdByEmail(email);
    await approveMerchant(merchantId);
    expect(await creditMerchant(merchantId, 50)).toBe("50.0000");

    const key = await staffApiKeyFor(merchantId, "e2e support key");
    expect(key.secret.length).toBeGreaterThan(20);

    const csrf = await signInMerchant(page, { email, password });
    const keys = await getJson<{ id: number; name: string; createdByStaff?: boolean }[]>(page.request, "/client/api-keys");
    expect(keys).toContainEqual(expect.objectContaining({ id: key.id, name: "e2e support key", createdByStaff: true }));

    // IMEI-ICL-LOST is a manual service: its orders wait for staff.
    const placed = await page.request.post("/client/orders", {
      headers: { Origin: siteOrigin, "X-CSRF-Token": csrf, "Idempotency-Key": randomUUID(), "Content-Type": "application/json" },
      data: { serviceId: await serviceIdByCode("IMEI-ICL-LOST"), imei: "490154203237518" },
    });
    expect(placed.status(), await placed.text()).toBe(201);
    const orderId = ((await placed.json()) as { orders: { id: number; status: string }[] }).orders[0].id;

    await completeOrder(orderId, "E2E-RESULT");
    const order = await getJson<{ status: string; result: { code: string } }>(page.request, `/client/orders/${orderId}`);
    expect(order.status).toBe("completed");
    expect(order.result.code).toBe("E2E-RESULT");
  });

  test("sendCampaign raises a customer's unread count to 1 within 20 seconds", async ({ page }) => {
    const email = await freshCustomer(page);
    const id = await customerIdByEmail(email);
    expect((await getJson<{ unread: number }>(page.request, "/store/v1/me/notifications/unread-count")).unread).toBe(0);

    await sendCampaign({
      to: { type: "customer", id },
      title: "Harness hello",
      body: "Line 1\nLine 2",
      link: "/account/orders",
    });
    await expect
      .poll(async () => (await getJson<{ unread: number }>(page.request, "/store/v1/me/notifications/unread-count")).unread, { timeout: 20_000, intervals: [500, 1_000] })
      .toBe(1);

    const feed = await getJson<{ title: string; body: string; link: string | null; readAt: string | null }[]>(
      page.request,
      "/store/v1/me/notifications?_start=0&_end=20",
    );
    expect(feed[0]).toMatchObject({ title: "Harness hello", body: "Line 1\nLine 2", link: "/account/orders", readAt: null });
  });
});

// Pure helpers of e2e/admin.ts: no network.
test.describe("pure helpers", () => {
  test("totp matches the RFC 6238 SHA-1 test vectors", () => {
    // Appendix B: the secret is the ASCII text "12345678901234567890"; the RFC prints 8 digits, a code has the last 6.
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(base32Decode(secret).toString("ascii")).toBe("12345678901234567890");
    const vectors: [number, string][] = [
      [59, "287082"],
      [1111111109, "081804"],
      [1111111111, "050471"],
      [1234567890, "005924"],
      [2000000000, "279037"],
      [20000000000, "353130"],
    ];
    for (const [seconds, code] of vectors) expect(totp(secret, seconds * 1000), `t = ${seconds}`).toBe(code);
    expect(totp(secret, 59_000, 1)).toBe(totp(secret, 89_000));
  });

  test("money amounts are 4-decimal strings and adjustments are cut at $500", () => {
    expect(toMoney4("20")).toBe("20.0000");
    expect(toMoney4(20.5)).toBe("20.5000");
    expect(() => toMoney4("1.23456")).toThrow();
    expect(() => toMoney4("-1")).toThrow();
    expect(splitMoney("20")).toEqual(["20.0000"]);
    expect(splitMoney("500.0001")).toEqual(["500.0000", "0.0001"]);
    expect(splitMoney("1250.5")).toEqual(["500.0000", "500.0000", "250.5000"]);
    expect(() => splitMoney("0")).toThrow();
  });

  test("quantity rules: packs are ascending and unique, a range needs 1 <= min <= max", () => {
    expect(normalizeRule({ options: [25, 5, 10, 5] })).toEqual({ min: 5, max: 25, options: [5, 10, 25] });
    expect(normalizeRule({ min: 5, max: 5 })).toEqual({ min: 5, max: 5, options: [] });
    expect(() => normalizeRule({ min: 0, max: 5 })).toThrow();
    expect(() => normalizeRule({ min: 6, max: 5 })).toThrow();
    expect(() => normalizeRule({ options: [] })).toThrow();
    expect(quantityMatches({ min: 2, max: 50, options: [] }, { min: 2, max: 50 })).toBe(true);
    expect(quantityMatches({ min: 5, max: 25, options: [5, 10, 25] }, { options: [5, 10, 25] })).toBe(true);
    expect(quantityMatches({ min: 5, max: 25, options: [] }, { options: [5, 10, 25] })).toBe(false);
    expect(quantityMatches({ min: 5, max: 25, options: [5, 10, 25] }, { min: 5, max: 25 })).toBe(false);
  });
});
