// Add funds (plan F33, BH §3.3, §3.6): the form with its limits and checks, a manual top-up from the instructions to the
// receipt, the staff decision (credited, rejected), cancel, the unpaid limit, the double-click guard, the return of an online
// payment with its poller, the file checks, the other customer's top-up and the narrow screens.
// Runs against the isolated demo backend (:3100) with the customer wallet switched on and the manual gateway "CliQ transfer
// (e2e)" made by the global setup (e2e/global-setup.ts).
// Rules (F03): every test uses a throwaway customer (`freshCustomer`): the `wallet-topup` limiter allows 10 attempts per 10
// minutes per customer, and refusals count. Nothing global is switched; staff credit and reject through e2e/admin.ts. The
// customers' setup (create, receipt) goes through the site's own API paths (`page.request`), so what the UI is asked is the
// part under test. The poller's answers are mocked in the browser (`page.route`): no demo gateway is online.
// Amounts are checked on the English pages ("$25.00").
// An amount inside a sentence is wrapped in Unicode isolates: sentences are matched in parts.
import { randomUUID } from "node:crypto";
import type { Locator, Page, Request } from "@playwright/test";
import { approveTopUp, customerIdByEmail, freezeCustomerWallet, rejectTopUp } from "./admin";
import { expect, test } from "./fixtures";
import { fixtures, freshCustomer, go } from "./helpers";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64");

/** The name and the transfer instructions of the manual gateway the global setup makes. */
const METHOD = "CliQ transfer (e2e)";
const INSTRUCTIONS = "Send the amount by CliQ to the alias GSMSHOP and write the top-up number in the note.";

const main = (page: Page) => page.getByRole("main");

/** Lists render a table from `md` up and a compact list below: only the visible copy counts. */
const vis = (locator: Locator) => locator.filter({ visible: true });

/** A statistic card of the wallet page, found by its label: the container of the label, the figure and the hint. */
const card = (page: Page, label: string) => main(page).getByText(label, { exact: true }).locator("xpath=..");

/** A named region of the wallet page ("Top-ups", "Statement"). The tables inside are regions too, hence `exact`. */
const region = (page: Page, name: string) => main(page).getByRole("region", { name, exact: true });

type TopUpRow = { id: number; number: string; status: string };

/** The readable CSRF cookie of the customer session (what the site's own client sends as `X-CSRF-Token`). */
async function storeCsrf(page: Page): Promise<string> {
  const cookie = (await page.context().cookies()).find((c) => c.name === "csrf_token_store");
  expect(cookie, "the customer is not signed in").toBeTruthy();
  return cookie!.value;
}

/** Starts a manual top-up through the API (as the form would), for a test that is about what comes after. */
async function createTopUp(page: Page, amount: string): Promise<TopUpRow> {
  const res = await page.request.post("/store/v1/me/wallet/top-ups", {
    headers: { "X-CSRF-Token": await storeCsrf(page), "Idempotency-Key": randomUUID() },
    data: { amount, gatewayId: fixtures().gatewayId },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as TopUpRow;
}

/** Uploads a receipt and attaches it (the top-up goes to `in_review`). */
async function sendReceipt(page: Page, topUpId: number, reference?: string): Promise<void> {
  const csrf = await storeCsrf(page);
  const upload = await page.request.post("/store/v1/files", {
    headers: { "X-CSRF-Token": csrf },
    multipart: { file: { name: "receipt.png", mimeType: "image/png", buffer: PNG } },
  });
  expect(upload.status(), await upload.text()).toBe(201);
  const { id: fileId } = (await upload.json()) as { id: number };
  const res = await page.request.post(`/store/v1/me/wallet/top-ups/${topUpId}/receipt`, {
    headers: { "X-CSRF-Token": csrf, "Idempotency-Key": randomUUID() },
    data: reference ? { fileId, reference } : { fileId },
  });
  expect(res.status(), await res.text()).toBe(201);
}

/** The top-up as the API would answer while it is an online top-up with the given status (the poller's mocked reads). */
function onlineTopUp(id: number, status: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    number: `INV-2026-${id}`,
    status,
    amount: "25.0000",
    fee: "0.0000",
    netAmount: "25.0000",
    currency: "USD",
    method: { id: 999, code: "card-mock", name: "Card (mock)", kind: "automatic", methodType: "card" },
    reference: null,
    receiptUploaded: false,
    rejectionReason: null,
    createdAt: new Date().toISOString(),
    creditedAt: null,
    ...extra,
  };
}

/** Picks the e2e method on the Add funds form (the whole card is the label of its radio). */
async function chooseMethod(page: Page) {
  await main(page).locator("label").filter({ hasText: METHOD }).click();
  await expect(main(page).getByRole("radio", { name: new RegExp(METHOD.replace(/[()]/g, "\\$&")) })).toBeChecked();
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

test.describe("Add funds: the form", () => {
  test("lists the method and the limits, refuses $2 with the minimum, and $25 creates a top-up with the instructions", async ({ page }) => {
    await freshCustomer(page);
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/store/v1/me/wallet/top-ups")) posts.push(request.url());
    });
    await go(page, "/en/account/wallet/add-funds");
    await expect(page.getByRole("heading", { level: 1, name: "Add funds" })).toBeVisible();

    const form = main(page).locator("form");
    await expect(form.getByRole("radio", { name: /CliQ transfer \(e2e\)/ })).toHaveCount(1);
    await expect(form.getByText("Manual transfer")).toBeVisible();
    await expect(form.getByText("No fee")).toBeVisible();
    // The wallet's limits are on the page before any attempt.
    await expect(form.getByText("Your limits")).toBeVisible();
    await expect(form).toContainText("Room in your wallet");
    await expect(form).toContainText("$1,000.00");

    // $2 is refused with the minimum, on the field, and nothing is sent.
    await chooseMethod(page);
    const amount = form.getByRole("textbox", { name: "Amount" });
    await amount.fill("2");
    await form.getByRole("button", { name: "Continue" }).click();
    const refusal = form.getByText(/The smallest top-up is/);
    await expect(refusal).toBeVisible();
    await expect(refusal).toContainText("$5.00");
    await expect(amount).toBeFocused();
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expect(amount).toHaveAccessibleDescription(/The smallest top-up is/);
    expect(posts, "a refused amount is never sent").toHaveLength(0);

    // A valid amount clears the message and fills the summary; $25 creates the top-up and shows the instructions.
    await amount.fill("25");
    await expect(form.getByText(/The smallest top-up is/)).toHaveCount(0);
    await expect(form.locator("aside")).toContainText("$25.00");
    await form.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/en\/account\/wallet\/top-ups\/\d+$/);
    await expect(page.getByRole("heading", { level: 1, name: /^Top-up INV-/ })).toBeVisible();
    await expect(vis(main(page).getByText(INSTRUCTIONS))).toBeVisible();
    await expect(main(page).getByText("Awaiting payment", { exact: true }).first()).toBeVisible();
    expect(posts).toHaveLength(1);
    await expect(main(page).getByText("Top-up number", { exact: true })).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Send receipt" })).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Cancel top-up" })).toBeVisible();

    // The receipt step is refused until a file is chosen, and nothing is sent.
    await main(page).getByRole("button", { name: "Send receipt" }).click();
    await expect(main(page).getByText("Upload your receipt first.")).toBeVisible();
    expect(posts, "a refused receipt step sends nothing").toHaveLength(1);

    // The wallet's list names the top-up.
    await go(page, "/en/account/wallet");
    const list = region(page, "Top-ups");
    await expect(list.getByRole("link", { name: /^View top-up INV-/ })).toHaveCount(1);
    await expect(vis(list.getByText("Awaiting payment", { exact: true }))).toHaveCount(1);
  });

  test("a text that is no amount and an amount above the maximum are refused on the field", async ({ page }) => {
    await freshCustomer(page);
    await go(page, "/en/account/wallet/add-funds");
    const form = main(page).locator("form");
    const amount = form.getByRole("textbox", { name: "Amount" });
    // The only method is preselected, so an empty amount is the first problem.
    await expect(form.getByRole("radio", { name: /CliQ transfer \(e2e\)/ })).toBeChecked();
    await form.getByRole("button", { name: "Continue" }).click();
    await expect(form.getByText("Enter a valid amount, for example 25 or 25.50.")).toBeVisible();
    await expect(amount).toBeFocused();

    await amount.fill("abc");
    await form.getByRole("button", { name: "Continue" }).click();
    await expect(form.getByText("Enter a valid amount, for example 25 or 25.50.")).toBeVisible();
    await expect(amount).toBeFocused();

    await amount.fill("600");
    await form.getByRole("button", { name: "Continue" }).click();
    await expect(form.getByText(/The largest top-up is/)).toBeVisible();
    await expect(form.getByText(/The largest top-up is/)).toContainText("$500.00");
    await expect(page).toHaveURL(/\/add-funds$/);
  });

  test("a fourth unpaid top-up is refused by the API with a plain sentence", async ({ page }) => {
    await freshCustomer(page);
    for (const amount of ["10", "11", "12"]) await createTopUp(page, amount);
    await go(page, "/en/account/wallet/add-funds");
    await chooseMethod(page);
    const form = main(page).locator("form");
    await form.getByRole("textbox", { name: "Amount" }).fill("13");
    await form.getByRole("button", { name: "Continue" }).click();
    await expect(main(page).getByRole("alert").filter({ hasText: "You already have three unpaid top-ups. Pay or cancel one first." })).toBeVisible();
    await expect(page).toHaveURL(/\/add-funds$/);
    // The button works again for another try.
    await expect(form.getByRole("button", { name: "Continue" })).toBeEnabled();

    // The wallet page lists the three, newest first, and counts what is waiting.
    await go(page, "/en/account/wallet");
    await expect(card(page, "Pending top-ups")).toContainText("$33.00");
    await expect(region(page, "Top-ups").getByRole("link", { name: /^View top-up INV-/ })).toHaveCount(3);
  });

  test("a double click sends one request with one key and creates one top-up", async ({ page }) => {
    await freshCustomer(page);
    const posts: Request[] = [];
    await page.route("**/store/v1/me/wallet/top-ups", async (route) => {
      if (route.request().method() === "POST") {
        posts.push(route.request());
        // A slow answer: the second click comes long before it.
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      await route.continue();
    });
    await go(page, "/en/account/wallet/add-funds");
    await chooseMethod(page);
    const form = main(page).locator("form");
    await form.getByRole("textbox", { name: "Amount" }).fill("25");
    await form.getByRole("button", { name: "Continue" }).dblclick();
    await expect(page).toHaveURL(/\/en\/account\/wallet\/top-ups\/\d+$/);

    expect(posts, "the second click must not send another request").toHaveLength(1);
    const headers = await posts[0].allHeaders();
    expect(headers["idempotency-key"]).toMatch(/^[\w-]{1,100}$/);
    expect(headers["x-csrf-token"], "the store CSRF token travels with the request").toBeTruthy();
    expect(headers["content-type"]).toContain("application/json");
    expect(posts[0].postDataJSON()).toEqual({ amount: "25.0000", gatewayId: fixtures().gatewayId });

    const list = await page.request.get("/store/v1/me/wallet/top-ups");
    expect(list.headers()["x-total-count"]).toBe("1");
  });

  test("a balance on hold still offers the bank transfer", async ({ page }) => {
    const email = await freshCustomer(page);
    await freezeCustomerWallet(await customerIdByEmail(email));
    await go(page, "/en/account/wallet/add-funds");
    await expect(main(page).getByRole("alert").filter({ hasText: "Your balance is on hold" })).toBeVisible();
    await chooseMethod(page);
    const form = main(page).locator("form");
    await form.getByRole("textbox", { name: "Amount" }).fill("10");
    await form.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/en\/account\/wallet\/top-ups\/\d+$/);
    await expect(vis(main(page).getByText(INSTRUCTIONS))).toBeVisible();
  });
});

test.describe("A manual top-up", () => {
  test("a receipt with a reference moves it to In review", async ({ page }) => {
    await freshCustomer(page);
    const topUp = await createTopUp(page, "25");
    await go(page, `/en/account/wallet/top-ups/${topUp.id}`);
    await expect(vis(main(page).getByText(INSTRUCTIONS))).toBeVisible();

    // Nothing to send yet: the button explains instead of sending.
    const send = main(page).getByRole("button", { name: "Send receipt" });
    await send.click();
    await expect(main(page).getByText("Upload your receipt first.")).toBeVisible();

    await main(page).locator('input[type="file"]').setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
    await expect(main(page).getByText("receipt.png")).toBeVisible();
    await expect(main(page).getByText("Upload your receipt first.")).toHaveCount(0);
    await main(page).getByRole("textbox", { name: /^Reference/ }).fill(`E2E-${Date.now()}`);
    await send.click();

    await expect(main(page).getByText("We are checking your receipt")).toBeVisible();
    await expect(main(page).getByText("In review", { exact: true }).first()).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Send receipt" })).toHaveCount(0);
    await expect(main(page).getByRole("button", { name: "Cancel top-up" })).toHaveCount(0);
    const read = await page.request.get(`/store/v1/me/wallet/top-ups/${topUp.id}`);
    expect(await read.json()).toMatchObject({ status: "in_review", receiptUploaded: true });
  });

  test("staff approving it shows Credited, the wallet shows $25, and the list and the statement name it", async ({ page }) => {
    const email = await freshCustomer(page);
    const customerId = await customerIdByEmail(email);
    const topUp = await createTopUp(page, "25");
    await sendReceipt(page, topUp.id);
    await approveTopUp(customerId, topUp.id);

    await go(page, `/en/account/wallet/top-ups/${topUp.id}`);
    await expect(main(page).getByText("Credited", { exact: true }).first()).toBeVisible();
    await expect(main(page).getByText("Added to your balance", { exact: true })).toBeVisible();
    await expect(main(page)).toContainText("$25.00");
    await expect(main(page).getByRole("button", { name: "Send receipt" })).toHaveCount(0);

    await go(page, "/en/account/wallet");
    await expect(card(page, "Available balance")).toContainText("$25.00");
    await expect(main(page).getByText("Pending top-ups")).toHaveCount(0);
    const list = region(page, "Top-ups");
    await expect(list.getByRole("link", { name: `View top-up ${topUp.number}` })).toHaveAttribute("href", `/en/account/wallet/top-ups/${topUp.id}`);
    await expect(vis(list.getByText("Credited", { exact: true }))).toHaveCount(1);
    await expect(vis(region(page, "Statement").getByText("Top-up", { exact: true }))).toHaveCount(1);
    await list.getByRole("link", { name: `View top-up ${topUp.number}` }).click();
    await expect(page).toHaveURL(new RegExp(`/en/account/wallet/top-ups/${topUp.id}$`));
  });

  test("cancelling one top-up closes it, and a 409 on a second cancel says it can no longer be changed", async ({ page }) => {
    await freshCustomer(page);
    await createTopUp(page, "10"); // stays open
    const second = await createTopUp(page, "11");
    await go(page, `/en/account/wallet/top-ups/${second.id}`);

    await main(page).getByRole("button", { name: "Cancel top-up" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Cancel this top-up?" })).toBeVisible();
    await dialog.getByRole("button", { name: "Yes, cancel it" }).click();
    await expect(main(page).getByText("This top-up was cancelled")).toBeVisible();
    await expect(main(page).getByText("Cancelled", { exact: true }).first()).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Cancel top-up" })).toHaveCount(0);
    await expect(main(page).getByRole("link", { name: "Start a new top-up" })).toHaveAttribute("href", "/en/account/wallet/add-funds");

    // A third top-up whose cancel the API answers 409 to (mocked: the real one would still be open).
    const third = await createTopUp(page, "12");
    const cancels: Request[] = [];
    await page.route("**/store/v1/me/wallet/top-ups/*/cancel", (route) => {
      cancels.push(route.request());
      return route.fulfill({
        status: 409,
        contentType: "application/problem+json",
        body: JSON.stringify({ type: "x", title: "x", status: 409, code: "CONFLICT", detail: "x", requestId: "req-e2e-409" }),
      });
    });
    await go(page, `/en/account/wallet/top-ups/${third.id}`);
    await main(page).getByRole("button", { name: "Cancel top-up" }).click();
    await dialog.getByRole("button", { name: "Yes, cancel it" }).click();
    await expect(main(page).getByRole("alert").filter({ hasText: "This top-up can no longer be changed." })).toBeVisible();
    await expect(dialog).toBeHidden();
    expect(cancels).toHaveLength(1);
    // No body and no Content-Type on the no-body route, the store CSRF token and a key on every wallet POST.
    const headers = await cancels[0].allHeaders();
    expect(headers["idempotency-key"]).toBeTruthy();
    expect(headers["x-csrf-token"]).toBeTruthy();
    expect(headers["content-type"]).toBeUndefined();
    expect(cancels[0].postData()).toBeNull();
  });

  test("a rejected top-up shows the staff's reason as text, never as markup", async ({ page }) => {
    const email = await freshCustomer(page);
    const customerId = await customerIdByEmail(email);
    const topUp = await createTopUp(page, "15");
    await sendReceipt(page, topUp.id);
    const reason = "Receipt not readable <b>retake it</b>";
    await rejectTopUp(customerId, reason, topUp.id);

    await go(page, `/en/account/wallet/top-ups/${topUp.id}`);
    await expect(main(page).getByText("This top-up was rejected")).toBeVisible();
    await expect(main(page).getByText(reason)).toBeVisible();
    await expect(main(page).locator("b")).toHaveCount(0);
    await expect(main(page).getByText("Rejected", { exact: true }).first()).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Start a new top-up" })).toHaveAttribute("href", "/en/account/wallet/add-funds");

    await go(page, "/en/account/wallet");
    await expect(vis(region(page, "Top-ups").getByText("Rejected", { exact: true }))).toHaveCount(1);
    await expect(card(page, "Available balance")).toContainText("$0.00");
  });

  test("a reference that was already used is refused under the reference field", async ({ page }) => {
    await freshCustomer(page);
    const reference = `E2E-DUP-${Date.now()}`;
    const first = await createTopUp(page, "10");
    await sendReceipt(page, first.id, reference);
    const second = await createTopUp(page, "11");
    await go(page, `/en/account/wallet/top-ups/${second.id}`);

    await main(page).locator('input[type="file"]').setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
    await expect(main(page).getByText("receipt.png")).toBeVisible();
    const field = main(page).getByRole("textbox", { name: /^Reference/ });
    await field.fill(reference);
    await main(page).getByRole("button", { name: "Send receipt" }).click();
    await expect(main(page).getByText("This reference was already used. Check the reference on your receipt.")).toBeVisible();
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    // The top-up is still open: another reference works.
    await field.fill(`${reference}-2`);
    await main(page).getByRole("button", { name: "Send receipt" }).click();
    await expect(main(page).getByText("We are checking your receipt")).toBeVisible();
  });

  test("a file over 5 MB or of the wrong type is refused before anything is uploaded", async ({ page }) => {
    await freshCustomer(page);
    const topUp = await createTopUp(page, "25");
    const uploads: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/store/v1/files")) uploads.push(request.method());
    });
    await go(page, `/en/account/wallet/top-ups/${topUp.id}`);
    const file = main(page).locator('input[type="file"]');

    await file.setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(6 * 1024 * 1024) });
    await expect(main(page).getByText("This file is empty or larger than 5 MB.")).toBeVisible();
    await file.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await expect(main(page).getByText("Upload a PDF, JPEG or PNG file.").first()).toBeVisible();
    expect(uploads, "a refused file never reaches the API").toHaveLength(0);
    await expect(main(page).getByText("big.png")).toHaveCount(0);
  });

  test("another customer's top-up is not found", async ({ page }) => {
    await freshCustomer(page);
    const mine = await createTopUp(page, "25");
    await page.context().clearCookies();
    await freshCustomer(page);
    await page.goto(`/en/account/wallet/top-ups/${mine.id}`);
    await expect(page.getByText(/not found/i).first()).toBeVisible();
    await expect(page.getByText(mine.number)).toHaveCount(0);
  });
});

test.describe("The return of an online payment", () => {
  test("follows the top-up through waiting, in review and credited, then refreshes the page", async ({ page }) => {
    test.setTimeout(120_000);
    await freshCustomer(page);
    const topUp = await createTopUp(page, "25");
    const replies = ["awaiting_payment", "in_review", "credited"];
    let reads = 0;
    await page.route(`**/store/v1/me/wallet/top-ups/${topUp.id}`, (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const status = replies[Math.min(reads++, replies.length - 1)];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(onlineTopUp(topUp.id, status, status === "credited" ? { creditedAt: new Date().toISOString() } : {})) });
    });
    const refreshes: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      // A refresh asks for the same address, `?topUp=<id>` included (the nav link's prefetch of the bare wallet page does not count).
      const isRefresh = url.searchParams.has("_rsc") || request.headers()["rsc"] === "1";
      if (url.pathname === "/en/account/wallet" && url.searchParams.get("topUp") === String(topUp.id) && isRefresh) refreshes.push(request.url());
    });

    await go(page, `/en/account/wallet?topUp=${topUp.id}`);
    // 1. the payment is awaited (the first read), 2. it is in review (5 s later), 3. it is credited (15 s after that).
    await expect(main(page).getByText("Waiting for your payment to be confirmed…")).toBeVisible();
    await expect(main(page).getByText("Payment received", { exact: true })).toBeVisible({ timeout: 30_000 });
    expect(refreshes, "the page is not refreshed before the end").toHaveLength(0);
    await expect(main(page).getByText("Top-up credited", { exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(main(page).getByText(/was added to your wallet/)).toContainText("$25.00");
    await expect.poll(() => refreshes.length, { timeout: 15_000 }).toBeGreaterThan(0);
    // The notice stays, with a way to the top-up, and no more reads follow.
    await expect(main(page).getByRole("link", { name: "View top-up", exact: true })).toHaveAttribute("href", `/en/account/wallet/top-ups/${topUp.id}`);
    const settled = reads;
    await page.waitForTimeout(6_000);
    expect(reads, "polling stops on a final state").toBe(settled);
  });

  test("a rejected online top-up shows the reason as text", async ({ page }) => {
    await freshCustomer(page);
    const topUp = await createTopUp(page, "25");
    await page.route(`**/store/v1/me/wallet/top-ups/${topUp.id}`, (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(onlineTopUp(topUp.id, "rejected", { rejectionReason: "Card <i>declined</i>" })),
          })
        : route.fallback(),
    );
    await go(page, `/en/account/wallet?topUp=${topUp.id}`);
    await expect(main(page).getByText("Top-up rejected", { exact: true })).toBeVisible();
    await expect(main(page).getByText("Card <i>declined</i>")).toBeVisible();
    await expect(main(page).locator("i")).toHaveCount(0);
  });

  test("a top-up that is not yours, or a value that is no id, shows no payment", async ({ page }) => {
    await freshCustomer(page);
    // 404: said once, politely, and the wallet is still there.
    await go(page, "/en/account/wallet?topUp=1");
    await expect(main(page).getByText("We could not find this top-up")).toBeVisible();
    await expect(card(page, "Available balance")).toContainText("$0.00");
    // Not digits: no notice at all, and no read of the API.
    const reads: string[] = [];
    page.on("request", (request) => {
      if (/\/store\/v1\/me\/wallet\/top-ups\/[^/?]+$/.test(request.url())) reads.push(request.url());
    });
    await go(page, "/en/account/wallet?topUp=abc%3Cb%3E");
    await expect(card(page, "Available balance")).toContainText("$0.00");
    await expect(main(page).getByText("Waiting for your payment")).toHaveCount(0);
    expect(reads).toHaveLength(0);
  });
});

test.describe("narrow screens", () => {
  test.beforeEach(async ({ page }) => page.setViewportSize({ width: 360, height: 800 }));

  test("the Add funds form, the top-up page and the wallet's list have no horizontal overflow at 360 px", async ({ page }) => {
    const labels = { amount: "Amount", next: "Continue", receipt: "Send receipt" };
    await freshCustomer(page);
    await go(page, "/en/account/wallet/add-funds");
    await chooseMethod(page);
    const form = main(page).locator("form");
    const amount = form.getByRole("textbox", { name: labels.amount });
    await amount.fill("25");
    await expect(form.locator("aside")).toContainText("25.00");
    await expectNoHorizontalOverflow(page);
    await expectInsideViewport(page, amount);
    await expectInsideViewport(page, form.getByRole("button", { name: labels.next }));

    // A refusal does not push anything out either.
    await amount.fill("2");
    await form.getByRole("button", { name: labels.next }).click();
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expectNoHorizontalOverflow(page);

    await amount.fill("25");
    await form.getByRole("button", { name: labels.next }).click();
    await expect(page).toHaveURL(/\/en\/account\/wallet\/top-ups\/\d+$/);
    const send = main(page).getByRole("button", { name: labels.receipt });
    await expect(send).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectInsideViewport(page, send);
    // On a phone what to do comes before the facts: the instructions are above the table of details.
    const instructions = vis(main(page).getByText(INSTRUCTIONS));
    await expect(instructions).toBeVisible();
    const facts = main(page).locator("dl").first();
    const [instructionsBox, factsBox] = [await instructions.boundingBox(), await facts.boundingBox()];
    expect(instructionsBox!.y, "the instructions come first on a phone").toBeLessThan(factsBox!.y);

    await go(page, "/en/account/wallet");
    await expect(main(page).getByRole("link", { name: /INV-/ }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
