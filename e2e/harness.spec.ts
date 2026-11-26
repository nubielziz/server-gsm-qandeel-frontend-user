// The e2e harness itself (API only, no page is opened): the demo data the global setup promises (e2e/global-setup.ts), the
// shared helpers (e2e/helpers.ts) and the staff helpers (e2e/admin.ts). Every later spec leans on these, so this one runs
// first on a new build: `E2E_RUN=$(date +%s) E2E_BASE_URL=http://localhost:5176 npx playwright test e2e/harness.spec.ts --project=desktop`.
// Calls go through the site (its /store/v1 and /client rewrites), as the browser's would; staff calls go straight to the
// API (the admin allow-list is loopback). Accounts that change are throwaway ones. There is one kind of account: the cases
// that touch a wallet, a password or a notification run once for each rank.
import { randomUUID } from "node:crypto";
import { type APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  accountWallet,
  availableCodes,
  base32Decode,
  campaignLink,
  changeRank,
  completeOrder,
  creditAccount,
  freezeWallet,
  normalizeRule,
  pickRanks,
  quantityMatches,
  rankIds,
  sendCampaign,
  serviceIdByCode,
  splitMoney,
  staffApiKeyFor,
  temporaryPassword,
  toMoney4,
  totp,
  unfreezeWallet,
  type RankKind,
} from "./admin";
import {
  BASE_URL,
  DEV_TURNSTILE_TOKEN,
  SET_PASSWORD_LINK,
  SIGN_IN_LINK,
  VERIFY_EMAIL_LINK,
  fixtures,
  freshAccount,
  merchantImeiInputs,
  signIn,
  signUpByLink,
  tokenOf,
  waitForLink,
} from "./helpers";

// API only: one project is enough (the setup, the accounts and the campaign are the same on both).
test.skip(({ isMobile }) => isMobile, "API only: the desktop project is enough");

const siteOrigin = new URL(BASE_URL).origin;
const RANKS: RankKind[] = ["retail", "merchant"];

/** The routes of each rank's family: a retail session reaches only the shop's, a merchant session only the portal's. */
const FAMILY = {
  retail: { me: "/store/v1/me", inbox: "/store/v1/me/notifications" },
  merchant: { me: "/client/auth/me", inbox: "/client/notifications" },
} as const;

/** What both "me" routes answer (AccountMe), as far as the harness reads it. */
interface AccountMe {
  id: number;
  email: string;
  status: string;
  rank: { id: number; name: string; kind: RankKind };
  hasPassword: boolean;
  emailVerifiedAt: string | null;
}

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

  test("the retail rank and the default merchant rank exist", async () => {
    const ranks = await rankIds();
    expect(ranks.retail).toBeGreaterThan(0);
    expect(ranks.merchant).toBeGreaterThan(0);
    expect(ranks.merchant).not.toBe(ranks.retail);
  });

  test("the store wallet is on and offers the manual gateway", async ({ page }) => {
    await freshAccount(page, { signedIn: true });
    const wallet = await getJson<{ enabled: boolean; balance: string }>(page.request, "/store/v1/me/wallet");
    expect(wallet.enabled).toBe(true);
    expect(wallet.balance).toBe("0.0000");
    const methods = await getJson<{ id: number; kind: string }[]>(page.request, "/store/v1/me/wallet/top-up-methods");
    expect(methods).toContainEqual(expect.objectContaining({ id: fixtures().gatewayId, kind: "manual" }));
  });
});

test.describe("accounts", () => {
  test("freshAccount makes a retail account by default: an invitation sets the password and proves the address", async ({ page }) => {
    const account = await freshAccount(page);
    expect(account.rank).toBe("retail");
    expect(await signIn(page, account)).not.toBe("");
    const me = await getJson<AccountMe>(page.request, FAMILY.retail.me);
    expect(me).toMatchObject({ id: account.id, email: account.email, status: "active", hasPassword: true, rank: { kind: "retail" } });
    expect(me.emailVerifiedAt).toEqual(expect.any(String));
  });

  test("freshAccount with the merchant rank: the Owner gives the rank and the one sign-in reaches the merchant routes", async ({ page }) => {
    const account = await freshAccount(page, { rank: "merchant", signedIn: true });
    const me = await getJson<AccountMe>(page.request, FAMILY.merchant.me);
    expect(me).toMatchObject({ id: account.id, email: account.email, status: "active", rank: { kind: "merchant" } });
    expect(me.emailVerifiedAt).toEqual(expect.any(String)); // an invitation proves the mailbox
  });

  for (const rank of RANKS) {
    test(`freshAccount unverified (${rank}): a staff change of the address clears the verification, and its link verifies it`, async ({ page }) => {
      const account = await freshAccount(page, { rank, unverified: true });
      await signIn(page, account);
      expect((await getJson<AccountMe>(page.request, FAMILY[rank].me)).emailVerifiedAt).toBeNull();

      // The verification link went to the new address and verifies it.
      const link = await waitForLink(page, account.email, VERIFY_EMAIL_LINK);
      const verified = await page.request.post("/client/auth/verify-email", {
        headers: { Origin: siteOrigin, "Content-Type": "application/json" },
        data: { token: tokenOf(link) },
      });
      expect(verified.status(), await verified.text()).toBe(204);
      expect((await getJson<AccountMe>(page.request, FAMILY[rank].me)).emailVerifiedAt).not.toBeNull();
    });
  }

  test("freshAccount suspended: the one sign-in answers 403 ACCOUNT_SUSPENDED", async ({ page }) => {
    const account = await freshAccount(page, { suspended: true });
    const res = await page.request.post("/client/auth/sign-in", {
      headers: { Origin: siteOrigin, "X-Turnstile-Token": DEV_TURNSTILE_TOKEN, "Content-Type": "application/json" },
      data: { email: account.email, password: account.password },
    });
    expect(res.status(), await res.text()).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("ACCOUNT_SUSPENDED");
  });

  test("signUpByLink makes a retail account with no password and signs the page in", async ({ page }) => {
    const { email, claimedOrders } = await signUpByLink(page, { claimGuestOrders: true });
    expect(claimedOrders).toBe(0);
    expect(await getJson<AccountMe>(page.request, FAMILY.retail.me)).toMatchObject({ email, hasPassword: false, rank: { kind: "retail" } });
  });

  test("changeRank moves an account between ranks and ends its sessions", async ({ page }) => {
    const account = await freshAccount(page, { signedIn: true });
    expect((await changeRank(account.id, "merchant")).rank.kind).toBe("merchant");
    expect((await page.request.get(FAMILY.retail.me)).status()).toBe(401); // every session of the account ended

    await page.context().clearCookies();
    await signIn(page, account);
    expect(await getJson<AccountMe>(page.request, FAMILY.merchant.me)).toMatchObject({ id: account.id, rank: { kind: "merchant" } });

    expect((await changeRank(account.id, "retail")).rank.kind).toBe("retail");
    await page.context().clearCookies();
    await signIn(page, account);
    expect(await getJson<AccountMe>(page.request, FAMILY.retail.me)).toMatchObject({ id: account.id, rank: { kind: "retail" } });
  });

  for (const rank of RANKS) {
    test(`staff credit, freeze and unfreeze the balance of a ${rank} account`, async ({ page }) => {
      const account = await freshAccount(page, { rank });
      const kind = rank === "retail" ? "store" : "merchant";
      expect(await creditAccount(account.id, "20")).toBe("20.0000");
      expect(await creditAccount(account.id, 5.5)).toBe("25.5000");
      expect(await accountWallet(account.id)).toMatchObject({ kind, balance: "25.5000", frozen: null });

      await freezeWallet(account.id);
      const frozen = await accountWallet(account.id);
      expect(frozen.frozen).not.toBeNull();
      expect(frozen.balance).toBe("25.5000");

      await unfreezeWallet(account.id);
      expect(await accountWallet(account.id)).toMatchObject({ kind, balance: "25.5000", frozen: null });
    });
  }

  test("a retail account reads its balance in the shop after staff credit it", async ({ page }) => {
    const account = await freshAccount(page, { signedIn: true });
    await creditAccount(account.id, "25.5");
    expect(await getJson<{ balance: string; available: string; frozen: unknown }>(page.request, "/store/v1/me/wallet")).toMatchObject({
      balance: "25.5000",
      available: "25.5000",
      frozen: null,
    });
  });

  for (const rank of RANKS) {
    test(`a temporary password makes the next sign-in of a ${rank} account ask for a new one`, async ({ page }) => {
      const account = await freshAccount(page, { rank });
      const temporary = await temporaryPassword(account.id);
      expect(temporary).not.toBe(account.password);
      await signIn(page, { email: account.email, password: temporary }, { next: "password" });
    });
  }

  test("staff make an API key for a merchant and complete the merchant's order; a retail account gets no key", async ({ page }) => {
    const account = await freshAccount(page, { rank: "merchant" });
    expect(await creditAccount(account.id, 50)).toBe("50.0000");

    const key = await staffApiKeyFor(account.id, "e2e support key");
    expect(key.secret.length).toBeGreaterThan(20);

    const csrf = await signIn(page, account);
    const keys = await getJson<{ id: number; name: string; createdByStaff?: boolean }[]>(page.request, "/client/api-keys");
    expect(keys).toContainEqual(expect.objectContaining({ id: key.id, name: "e2e support key", createdByStaff: true }));

    // IMEI-ICL-LOST is a manual service: its orders wait for staff. Its IMEI is an input under the key of its own IMEI field (decision 007).
    const serviceId = await serviceIdByCode("IMEI-ICL-LOST");
    const placed = await page.request.post("/client/orders", {
      headers: { Origin: siteOrigin, "X-CSRF-Token": csrf, "Idempotency-Key": randomUUID(), "Content-Type": "application/json" },
      data: { serviceId, inputs: await merchantImeiInputs(page.request, serviceId, "490154203237518") },
    });
    expect(placed.status(), await placed.text()).toBe(201);
    const orderId = ((await placed.json()) as { orders: { id: number; status: string }[] }).orders[0].id;

    await completeOrder(orderId, "E2E-RESULT");
    const order = await getJson<{ status: string; result: { code: string } }>(page.request, `/client/orders/${orderId}`);
    expect(order.status).toBe("completed");
    expect(order.result.code).toBe("E2E-RESULT");

    const retail = await freshAccount(page);
    await expect(staffApiKeyFor(retail.id, "e2e retail key")).rejects.toMatchObject({ status: 409 });
  });

  for (const rank of RANKS) {
    test(`sendCampaign raises the unread count of a ${rank} account to 1 within 20 seconds`, async ({ page }) => {
      const account = await freshAccount(page, { rank, signedIn: true });
      const inbox = FAMILY[rank].inbox;
      expect((await getJson<{ unread: number }>(page.request, `${inbox}/unread-count`)).unread).toBe(0);

      await sendCampaign({
        to: { type: "account", id: account.id },
        title: "Harness hello",
        body: "Line 1\nLine 2",
        link: "/account/orders",
      });
      await expect
        .poll(async () => (await getJson<{ unread: number }>(page.request, `${inbox}/unread-count`)).unread, { timeout: 20_000, intervals: [500, 1_000] })
        .toBe(1);

      const feed = await getJson<{ title: string; body: string; link: string | null; readAt: string | null }[]>(page.request, `${inbox}?_start=0&_end=20`);
      expect(feed[0]).toMatchObject({ title: "Harness hello", body: "Line 1\nLine 2", link: "/account/orders", readAt: null });
    });
  }
});

// Pure helpers of e2e/admin.ts and e2e/helpers.ts: no network.
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

  test("pickRanks: the lowest-id retail rank, and the default merchant rank (else the lowest-id one)", () => {
    const rank = (id: number, rankKind: RankKind, isDefault = false) => ({ id, name: `Rank ${id}`, rankKind, isDefault });
    expect(pickRanks([rank(3, "merchant"), rank(1, "retail"), rank(2, "merchant", true)])).toEqual({ retail: 1, merchant: 2 });
    expect(pickRanks([rank(5, "merchant"), rank(4, "merchant"), rank(1, "retail"), rank(9, "retail")])).toEqual({ retail: 1, merchant: 4 });
    expect(() => pickRanks([rank(2, "merchant")])).toThrow(/retail rank/);
    expect(() => pickRanks([rank(1, "retail")])).toThrow(/merchant rank/);
  });

  test("a plain campaign link goes to both audiences; a link per audience stays as it is", () => {
    expect(campaignLink(undefined)).toBeUndefined();
    expect(campaignLink("/account/orders")).toEqual({ customer: "/account/orders", merchant: "/account/orders" });
    expect(campaignLink({ merchant: "/account/invoices" })).toEqual({ merchant: "/account/invoices" });
  });

  test("the mailed links are the pages at the root of the shop, for every rank", () => {
    expect(SET_PASSWORD_LINK.test("/set-password?token=abc")).toBe(true);
    expect(VERIFY_EMAIL_LINK.test("/verify-email?token=abc")).toBe(true);
    // The old portal folder is no address of a mailed link any more.
    expect(SET_PASSWORD_LINK.test("/merchant/set-password?token=abc")).toBe(false);
    expect(VERIFY_EMAIL_LINK.test("/merchant/verify-email?token=abc")).toBe(false);
    expect(SIGN_IN_LINK.test("/sign-in?token=abc")).toBe(true);
    expect(SET_PASSWORD_LINK.test("/verify-email?token=abc")).toBe(false);
    expect(VERIFY_EMAIL_LINK.test("/set-password?token=abc")).toBe(false);
    expect(SIGN_IN_LINK.test("/sign-in")).toBe(false);
  });
});
