// Pay a checkout from the store balance (plan F30, D9; BH §3.4, §11, SH traps 13 and 18). Real browser → Next → the
// isolated demo backend (:3100). The demo card gateway cannot take a payment, so the balance is the only complete payment
// path here: these tests really pay, and check the order that results.
// Rules (F03): every test that changes data uses a throwaway retail account (`signUpByLink`); nothing global is switched; staff
// credit and freeze through e2e/admin.ts. The wallet is switched on by the global setup (e2e/global-setup.ts).
// What is mocked at the browser boundary: answers that cannot be provoked on demand (401 on the payment, 402, 503, the
// two idempotency conflicts). What is real: the 403 of another customer's checkout and the 409 of a wallet put on hold
// after the page loaded.
import { randomUUID } from "node:crypto";
import type { APIRequestContext, Locator, Page, Request } from "@playwright/test";
import { accountIdByEmail, creditAccount, freezeWallet } from "./admin";
import { expect, test } from "./fixtures";
import { DEV_TURNSTILE_TOKEN, freshAccount, imeiBox, imeiInputs, signIn, signUpByLink, stubTurnstile } from "./helpers";

/** Service 1: an IMEI service sold at $3.99 net, one at a time. Its IMEI is its field of type `imei` (decisions 007 and 008). */
const SLUG = "icloud-clean-lost-check";
const SERVICE_NAME = "iCloud Clean / Lost Check";
const IMEI = "490154203237518";

/** The balance payment route of any checkout. */
const BALANCE_URL = "**/store/v1/checkout-sessions/*/balance-payment";
const isBalancePost = (request: Request) => request.method() === "POST" && /\/checkout-sessions\/[^/]+\/balance-payment$/.test(request.url());

interface SessionBody {
  token: string;
  amounts: { usd: { gross: string }; display: { gross: string } };
}

interface PaidBody {
  payment: { amountUsd: string };
  order: { id: number; trackingToken: string };
  wallet: { balance: string; available: string };
}

interface StatementRow {
  kind: string;
  orderId: number | null;
  amount: string;
}

// ── Money as 4-decimal strings (BigInt of ten-thousandths, never floats) ─────────────────────────────────────────────

const SCALE = BigInt(10_000);

function units(amount: string): bigint {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(4, "0").slice(0, 4));
}

/** `minus("20.0000", "4.7500")` is "15.2500". */
function minus(a: string, b: string): string {
  const left = units(a) - units(b);
  return `${left / SCALE}.${String(left % SCALE).padStart(4, "0")}`;
}

/** "15.2500" as the English page prints USD: "$15.25" (half up at the second decimal). */
function usd(amount: string): string {
  const cents = (units(amount) + BigInt(50)) / BigInt(100);
  return `$${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
}

// ── Accounts and checkouts through the API ───────────────────────────────────────────────────────────────────────────

/** A throwaway retail account, signed in on this page, with `amount` credited when given. */
async function customerWith(page: Page, amount?: string): Promise<{ email: string; id: number }> {
  const { email } = await signUpByLink(page);
  const id = await accountIdByEmail(email);
  if (amount) await creditAccount(id, amount);
  return { email, id };
}

/** The readable CSRF cookie of the signed-in retail account (the browser client sends it as a header). */
async function storeCsrf(page: Page): Promise<string> {
  const cookie = (await page.context().cookies()).find((c) => c.name === "csrf_token_store");
  expect(cookie, "the account has no store session").toBeTruthy();
  return decodeURIComponent(cookie!.value);
}

/** Opens a checkout as the page's signed-in customer (a signed-in customer must send the CSRF token and their own email). */
async function openCustomerSession(page: Page, email: string): Promise<SessionBody> {
  const res = await page.request.post("/store/v1/checkout-sessions", {
    headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN, "X-CSRF-Token": await storeCsrf(page), "Content-Type": "application/json" },
    data: { serviceId: 1, email, country: "DE", currency: "USD", inputs: await imeiInputs(page.request, SLUG, IMEI), quantity: 1 },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as SessionBody;
}

/** Opens a checkout as a guest: the request fixture has no cookies, whoever is signed in on the page. */
async function openGuestSession(request: APIRequestContext): Promise<SessionBody> {
  const res = await request.post("/store/v1/checkout-sessions", {
    headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN, "Content-Type": "application/json" },
    data: { serviceId: 1, email: "e2e-balance-guest@example.com", country: "DE", currency: "USD", inputs: await imeiInputs(request, SLUG, IMEI), quantity: 1 },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as SessionBody;
}

async function walletOf(page: Page): Promise<{ balance: string; available: string }> {
  const res = await page.request.get("/store/v1/me/wallet");
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as { balance: string; available: string };
}

async function statementOf(page: Page): Promise<StatementRow[]> {
  const res = await page.request.get("/store/v1/me/wallet/statement?_start=0&_end=25");
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as StatementRow[];
}

// ── The review page ──────────────────────────────────────────────────────────────────────────────────────────────────

const main = (page: Page) => page.getByRole("main");

const balanceRadio = (page: Page) => main(page).getByRole("radio", { name: /Store balance/ });

/** The card gateway's radio (a name from the session's payment methods). */
const cardRadio = (page: Page) => main(page).getByRole("radio", { name: /Card gateway/ });

const payButton = (page: Page) => main(page).getByRole("button", { name: /^Pay / });

/** The error box under the summary. */
const payError = (page: Page) => page.locator("#pay-error");

const CONSENTS: RegExp[] = [/Terms of service/, /Privacy policy/, /lose my right to withdraw/];

/** The review page is drawn and React is attached: a box ticked before that would be reset at hydration. */
async function reviewReady(page: Page) {
  const button = payButton(page);
  await expect(button).toBeVisible();
  await expect.poll(() => button.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps")))).toBe(true);
}

async function openReview(page: Page, token: string) {
  await page.goto(`/en/checkout/${token}`);
  await reviewReady(page);
}

async function acceptConsents(page: Page) {
  for (const name of CONSENTS) await main(page).getByRole("checkbox", { name }).check();
}

/** Records every balance payment the page sends, with the headers that matter. */
function watchBalancePosts(page: Page): { requests: Request[]; keys: () => (string | undefined)[] } {
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (isBalancePost(request)) requests.push(request);
  });
  return { requests, keys: () => requests.map((request) => request.headers()["idempotency-key"]) };
}

type Reply = { status: number; body: Record<string, unknown>; headers?: Record<string, string> };

/** Answers the next balance payments with `next()` (a mock) or lets them through when it returns null. */
async function mockBalancePayment(page: Page, next: () => Reply | null) {
  await page.route(BALANCE_URL, (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const reply = next();
    if (!reply) return route.fallback();
    return route.fulfill({
      status: reply.status,
      contentType: "application/problem+json",
      headers: reply.headers,
      body: JSON.stringify({ title: "x", detail: "x", requestId: "req-e2e-balance", ...reply.body }),
    });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
}

/** A control lies inside the viewport. */
async function expectInsideViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box, "the control is not on screen").not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
}

test.describe("pay from the store balance", () => {
  test("a signed-in customer opens a checkout, sees the balance first and one click lands on tracking", async ({ page }) => {
    await stubTurnstile(page);
    await customerWith(page, "20.0000");

    // Through the UI, as a customer would: details, country, "Continue to payment".
    await page.goto(`/en/checkout?service=${SLUG}`);
    await expect(page.getByRole("button", { name: "Continue to payment" })).toBeEnabled();
    await page.getByRole("button", { name: "Enter details" }).first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await drawer.getByLabel((await imeiBox(page.request, SLUG)).label).fill(IMEI);
    await drawer.getByRole("button", { name: "Save details and continue" }).click();
    await expect(page.getByText("Details added")).toBeVisible();
    await page.getByLabel("Country").selectOption("DE");
    const created = page.waitForResponse((r) => r.url().endsWith("/store/v1/checkout-sessions") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Continue to payment" }).click();
    const session = (await (await created).json()) as SessionBody;
    const gross = session.amounts.usd.gross;
    await expect(page).toHaveURL(new RegExp(`/en/checkout/${session.token}$`));

    // The balance is the first choice, picked, with the figure the wallet holds; the card gateway is still there.
    await reviewReady(page);
    await expect(balanceRadio(page)).toBeChecked();
    await expect(balanceRadio(page)).toBeEnabled();
    await expect(main(page).getByText("Available: $20.00")).toBeVisible();
    await expect(cardRadio(page)).not.toBeChecked();
    const radios = main(page).getByRole("radio");
    await expect(radios.first()).toHaveAccessibleName(/Store balance/);
    // A checkout in dollars does not repeat the amount in dollars ("This order takes …").
    await expect(main(page).getByText(/This order takes/)).toHaveCount(0);

    // One click: consents, then the payment with a key, no body and no Content-Type.
    await acceptConsents(page);
    const sent = page.waitForRequest(isBalancePost);
    const paid = page.waitForResponse((r) => isBalancePost(r.request()));
    await payButton(page).click();
    const request = await sent;
    const headers = await request.allHeaders();
    expect(headers["idempotency-key"]).toMatch(/^[\w-]{8,100}$/);
    expect(headers["x-csrf-token"], "the store CSRF token travels with the payment").toBeTruthy();
    expect(headers["content-type"], "a JSON content type with an empty body answers 400").toBeUndefined();
    expect(request.postData()).toBeNull();

    const response = await paid;
    expect(response.status()).toBe(201);
    const result = (await response.json()) as PaidBody;
    expect(result.payment.amountUsd).toBe(gross);
    await expect(page).toHaveURL(new RegExp(`/en/track/${result.order.trackingToken}$`));
    await expect(page.getByRole("heading", { name: SERVICE_NAME })).toBeVisible();

    // The wallet reads $20 minus the USD gross, on the page and in the API; the statement names the order once.
    const wallet = await walletOf(page);
    expect(wallet.balance).toBe(minus("20.0000", gross));
    expect(wallet.balance).toBe(result.wallet.balance);
    const rows = (await statementOf(page)).filter((row) => row.kind === "b2c_payment");
    expect(rows).toHaveLength(1);
    expect(rows[0].orderId).toBe(result.order.id);
    await page.goto("/en/account/wallet");
    await expect(page.getByRole("heading", { level: 1, name: "Wallet" })).toBeVisible();
    await expect(main(page).getByText("Available balance", { exact: true }).locator("xpath=..")).toContainText(usd(wallet.balance));
  });

  test("a double click sends one key and creates one payment", async ({ page }) => {
    const { email } = await customerWith(page, "20.0000");
    const session = await openCustomerSession(page, email);
    const gross = session.amounts.usd.gross;
    const posts = watchBalancePosts(page);
    await openReview(page, session.token);
    await acceptConsents(page);
    await payButton(page).dblclick();
    await expect(page).toHaveURL(/\/en\/track\/[A-Za-z0-9_-]+$/);

    // However many requests the clicks made, they carry one key, so the API makes one payment.
    expect(posts.requests.length).toBeGreaterThanOrEqual(1);
    expect(new Set(posts.keys()).size).toBe(1);
    expect(posts.keys()[0]).toBeTruthy();
    expect((await statementOf(page)).filter((row) => row.kind === "b2c_payment")).toHaveLength(1);
    expect((await walletOf(page)).balance).toBe(minus("20.0000", gross));
  });

  test("a guest checkout shows no balance choice", async ({ page, request }) => {
    const session = await openGuestSession(request);
    await openReview(page, session.token);
    await expect(cardRadio(page)).toBeChecked();
    await expect(balanceRadio(page)).toHaveCount(0);
    await expect(main(page).getByText(/store balance/i)).toHaveCount(0);
    await expect(main(page).getByRole("link", { name: /Sign in|Start a new checkout/ })).toHaveCount(0);
  });

  test("a checkout opened as a guest and then viewed signed in offers a new checkout, not the balance", async ({ page, request }) => {
    const session = await openGuestSession(request);
    await customerWith(page, "20.0000");
    await openReview(page, session.token);
    await expect(main(page).getByText(/opened without your account/)).toBeVisible();
    await expect(balanceRadio(page)).toHaveCount(0);
    // Same service and quantity, so the new checkout starts where this one did.
    await expect(main(page).getByRole("link", { name: "Start a new checkout" })).toHaveAttribute(
      "href",
      `/en/checkout?service=${SLUG}&quantity=1`,
    );
    await expect(cardRadio(page)).toBeChecked();
  });

  test("a visitor who is not signed in is asked to sign in to use the balance of a checkout a customer opened", async ({ page }) => {
    const { email } = await customerWith(page, "20.0000");
    const session = await openCustomerSession(page, email);
    await page.context().clearCookies();
    await openReview(page, session.token);
    await expect(main(page).getByText("Sign in to pay from your store balance.")).toBeVisible();
    await expect(balanceRadio(page)).toHaveCount(0);
    const link = main(page).getByRole("link", { name: "Sign in" });
    await expect(link).toHaveAttribute("href", `/en/sign-in?next=${encodeURIComponent(`/en/checkout/${session.token}`)}`);
    await expect(cardRadio(page)).toBeChecked();
  });

  test("not enough balance: the choice is disabled, the figures and Add funds are shown, a card can still be picked", async ({ page }) => {
    const { email } = await customerWith(page, "1.0000");
    const session = await openCustomerSession(page, email);
    await openReview(page, session.token);
    await expect(balanceRadio(page)).toBeDisabled();
    await expect(balanceRadio(page)).not.toBeChecked();
    await expect(main(page).getByText(`${usd("1.0000")} available, ${usd(session.amounts.usd.gross)} needed`)).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Add funds" })).toHaveAttribute("href", "/en/account/wallet/add-funds");
    // The other methods stay usable, and "Pay" names the gateway path.
    await expect(cardRadio(page)).toBeChecked();
    await expect(payButton(page)).toBeEnabled();
  });

  test("a payment answered 401 asks to sign in and does not sign the customer out", async ({ page }) => {
    const { email } = await customerWith(page, "20.0000");
    const session = await openCustomerSession(page, email);
    await mockBalancePayment(page, () => ({ status: 401, body: { code: "UNAUTHORIZED" } }));
    await openReview(page, session.token);
    await acceptConsents(page);
    await payButton(page).click();

    await expect(payError(page).getByText(/Sign in to pay from your balance/)).toBeVisible();
    await expect(payError(page)).toBeFocused();
    await expect(payError(page).getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/en/sign-in?next=${encodeURIComponent(`/en/checkout/${session.token}`)}`,
    );
    await expect(page).toHaveURL(new RegExp(`/en/checkout/${session.token}$`));
    // The 401 was a mock: the real session is untouched, and the page did not drop it either.
    expect((await page.request.get("/store/v1/me")).status()).toBe(200);
    expect((await page.context().cookies()).some((c) => c.name === "csrf_token_store")).toBe(true);
    await expect(balanceRadio(page)).toBeChecked();
    await expect(payButton(page)).toBeEnabled();
  });

  test("another account's checkout answers 403 FORBIDDEN: a new checkout is offered and nobody is signed out", async ({ page }) => {
    const owner = await customerWith(page, "20.0000");
    const session = await openCustomerSession(page, owner.email);
    // A second account signs in on the same browser and opens the first one's checkout link.
    await page.context().clearCookies();
    await customerWith(page, "20.0000");
    await openReview(page, session.token);
    await expect(balanceRadio(page)).toBeChecked(); // the session cannot say who opened it: the payment decides
    await acceptConsents(page);
    await payButton(page).click();

    await expect(payError(page).getByText(/opened by another account or as a guest/)).toBeVisible();
    // Focus lands on the message once it is rendered, so the new links are one Tab away (plan §0.7).
    await expect(payError(page)).toBeFocused();
    await expect(payError(page).getByRole("link", { name: "Start a new checkout" })).toHaveAttribute(
      "href",
      `/en/checkout?service=${SLUG}&quantity=1`,
    );
    await expect(page).toHaveURL(new RegExp(`/en/checkout/${session.token}$`));
    expect((await page.request.get("/store/v1/me")).status()).toBe(200);
  });

  test("402, a wallet put on hold and maintenance are said by code, and the wallet is read again", async ({ page }) => {
    const { email, id } = await customerWith(page, "20.0000");
    const session = await openCustomerSession(page, email);
    let reply: Reply | null = { status: 402, body: { code: "INSUFFICIENT_FUNDS" } };
    await mockBalancePayment(page, () => reply);
    await openReview(page, session.token);
    await acceptConsents(page);

    // 402: the balance is lower than the total (a mock: the real balance is $20, so the choice stays after the re-read).
    await payButton(page).click();
    await expect(payError(page).getByText(/lower than the total of this order/)).toBeVisible();
    await expect(payError(page)).toBeFocused();
    await expect(payError(page).getByRole("link", { name: "Add funds" })).toHaveAttribute("href", "/en/account/wallet/add-funds");

    // 503 MAINTENANCE: with the expected end.
    reply = { status: 503, body: { code: "MAINTENANCE", expectedEndAt: "2026-11-20T08:00:00.000Z" }, headers: { "Retry-After": "600" } };
    await expect(payButton(page)).toBeEnabled();
    await payButton(page).click();
    await expect(payError(page).getByText(/Payments are temporarily unavailable because of maintenance/)).toBeVisible();
    await expect(payError(page).getByText(/Expected back around/)).toBeVisible();
    // A retry removes the box and renders a new one: focus moves to it again.
    await expect(payError(page)).toBeFocused();

    // 409 WALLET_FROZEN, for real: staff put the balance on hold after the page loaded. The page says so, reads the wallet
    // again, shows the choice disabled and falls back to the card.
    reply = null;
    await freezeWallet(id);
    await expect(payButton(page)).toBeEnabled();
    await payButton(page).click();
    await expect(payError(page).getByText(/Your store balance is on hold, so it cannot be used for this right now/)).toBeVisible();
    await expect(balanceRadio(page)).toBeDisabled();
    await expect(main(page).getByText(/Your store balance is on hold, so it cannot be used to pay/)).toBeVisible();
    await expect(cardRadio(page)).toBeChecked();
    await expect(payButton(page)).toBeEnabled();
    await expect(page).toHaveURL(new RegExp(`/en/checkout/${session.token}$`));
    // Nothing was paid on the way.
    expect((await walletOf(page)).balance).toBe("20.0000");
  });

  test("409 IDEMPOTENCY_IN_PROGRESS waits and sends the same key again; IDEMPOTENCY_KEY_REUSED takes a new key", async ({ page }) => {
    const { email } = await customerWith(page, "20.0000");
    const session = await openCustomerSession(page, email);
    const posts = watchBalancePosts(page);
    let answers = 0;
    await mockBalancePayment(page, () => {
      answers += 1;
      if (answers === 1) return { status: 409, body: { code: "IDEMPOTENCY_IN_PROGRESS" }, headers: { "Retry-After": "1" } };
      if (answers === 2) return { status: 409, body: { code: "IDEMPOTENCY_KEY_REUSED" } };
      return null; // the third send is real
    });
    await openReview(page, session.token);
    await acceptConsents(page);
    await payButton(page).click();
    await expect(page).toHaveURL(/\/en\/track\/[A-Za-z0-9_-]+$/, { timeout: 30_000 });

    const keys = posts.keys();
    expect(keys).toHaveLength(3);
    expect(keys[1], "IN_PROGRESS: the same request is sent again with the same key").toBe(keys[0]);
    expect(keys[2], "KEY_REUSED: the key is forgotten and the next send has a new one").not.toBe(keys[1]);
    expect((await statementOf(page)).filter((row) => row.kind === "b2c_payment")).toHaveLength(1);
  });

  test("at 360 px the review page does not scroll sideways and the balance choice and Pay stay on screen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const { email } = await customerWith(page, "1.0000");
    const session = await openCustomerSession(page, email);
    // $1 against a total of about $4.75: the longest state (the disabled choice with its figures and Add funds).
    await openReview(page, session.token);
    await expect(balanceRadio(page)).toBeDisabled();
    await expectNoHorizontalOverflow(page);
    await expectInsideViewport(page, main(page).locator("label:has(input[value='balance'])"));
    await expectInsideViewport(page, payButton(page));
  });
});

test.describe("a merchant rank and the store balance", () => {
  test("is offered the payment methods only, and the API refuses a balance payment from it", async ({ page, request }) => {
    // A checkout opened as a guest: the balance could not pay it for anyone, and an account of a merchant rank has none at all.
    const session = await openGuestSession(request);
    const account = await freshAccount(page, { rank: "merchant" });
    const csrf = await signIn(page, account);
    await openReview(page, session.token);
    await expect(balanceRadio(page)).toHaveCount(0);
    await expect(main(page).getByText(/store balance/i)).toHaveCount(0);
    await expect(main(page).getByText("Sign in to pay from your store balance.")).toHaveCount(0);
    await expect(cardRadio(page)).toBeChecked();
    await expect(payButton(page)).toBeEnabled();

    const refused = await page.request.post(`/store/v1/checkout-sessions/${session.token}/balance-payment`, {
      headers: { "X-CSRF-Token": csrf, "Idempotency-Key": randomUUID() },
    });
    expect(refused.status(), await refused.text()).toBe(403);
    expect(((await refused.json()) as { code?: string }).code).toBe("RANK_NOT_ALLOWED");
    // Nothing was paid and the account is still signed in.
    expect((await page.request.get("/client/auth/me")).status()).toBe(200);
  });
});
