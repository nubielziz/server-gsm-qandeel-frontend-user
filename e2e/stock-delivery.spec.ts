// Stocked delivery and tracking (plan F32, BH §14.4, §14.5, §14.9): a service with stock completes at once and answers with
// its codes one per line; the tracking page lists them, each with a Copy button, plus "Copy all"; an order the stock could not
// cover stays pending and the page promises no time; a staff reply with words stays one block.
// Real browser → Next → the isolated demo backend (:3100). The service is the packs fixture of the global setup (packs of
// 5, 10 and 25; e2e/global-setup.ts → e2e/.auth/fixtures.json): codes are taken only when the order is created and only when
// they cover the whole quantity, never reserved. The customer, the codes it buys and the orders are this test's own.
import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { store } from "../lib/i18n/messages/store";
import { availableCodes, completeOrder, creditCustomer, customerIdByEmail, ensureStock } from "./admin";
import { expect, test } from "./fixtures";
import { DEV_TURNSTILE_TOKEN, fixtures, freshCustomer } from "./helpers";

const PASSWORD = "Orchard-Lantern-8841";
const IMEI = "490154203237518";

/** Words and digits that would promise a time (the plain "as soon as it is ready" does not). */
const PROMISES_A_TIME = /\d|second|minute|hour|\bdays?\b|week|instant|immediate|quick|fast|shortly|within/i;

/** Waits until React has attached to an element: before that a click does nothing. */
async function hydrated(locator: Locator) {
  await expect.poll(() => locator.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps")))).toBe(true);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
}

const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

/**
 * As the signed-in customer: opens a checkout, records every consent it asks for and pays it from the store balance
 * (`POST …/balance-payment`: no body, no Content-Type, its own Idempotency-Key). Returns the order.
 */
async function buyFromBalance(page: Page, email: string, serviceId: number, quantity: number): Promise<{ id: number; trackingToken: string }> {
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "csrf_token_store")?.value ?? "";
  const opened = await page.request.post("/store/v1/checkout-sessions", {
    headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN, "X-CSRF-Token": csrf, "Content-Type": "application/json" },
    data: { serviceId, email, country: "US", currency: "USD", quantity, imei: IMEI },
  });
  expect(opened.status(), await opened.text()).toBe(201);
  const session = (await opened.json()) as { token: string; balancePayable: boolean; consent: { required: string[] } };
  expect(session.balancePayable, "a signed-in customer's checkout can be paid from the balance").toBe(true);

  const consents = await page.request.post(`/store/v1/checkout-sessions/${session.token}/consents`, {
    headers: { "X-CSRF-Token": csrf, "Content-Type": "application/json" },
    data: { consents: session.consent.required.map((purpose) => ({ purpose, granted: true })) },
  });
  expect(consents.status(), await consents.text()).toBe(201);

  const paid = await page.request.post(`/store/v1/checkout-sessions/${session.token}/balance-payment`, {
    headers: { "X-CSRF-Token": csrf, "Idempotency-Key": randomUUID() },
  });
  expect(paid.status(), await paid.text()).toBe(201);
  return ((await paid.json()) as { order: { id: number; trackingToken: string } }).order;
}

test("a stocked order completes at once, its codes are listed with a Copy button each, and an order without stock promises no time", async ({ page }) => {
  test.setTimeout(150_000);
  const { packs } = fixtures();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  // 1 to 3. A fresh customer with a password and a balance; five codes on the packs service.
  const email = await freshCustomer(page, PASSWORD);
  await creditCustomer(await customerIdByEmail(email), 300, "e2e stock delivery");
  await ensureStock(packs.id, 5, "E2ESD");

  // 4. Five units from stock: the order is completed when it is created.
  const stocked = await buyFromBalance(page, email, packs.id, 5);

  // 5. Tracking page.
  await page.goto(`/en/track/${stocked.trackingToken}`);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 2, name: "Result", exact: true })).toBeVisible();
  await expect(main.getByText("Completed", { exact: true }).first()).toBeVisible();
  const region = page.getByRole("region", { name: "Your codes" });
  await expect(region).toBeVisible(); // wait for the content before reading it
  const items = region.getByRole("listitem");
  await expect(items).toHaveCount(5);
  await expect(region.locator('bdi[dir="ltr"]')).toHaveCount(5); // a code is isolated left-to-right
  await expect(main.locator("pre")).toHaveCount(0);
  const codes = await items.locator("bdi").allTextContents();
  expect(codes).toHaveLength(5);
  expect(new Set(codes).size, "five different codes").toBe(5);
  for (const code of codes) expect(code).toMatch(/^\S{6,128}$/);
  for (let n = 1; n <= 5; n += 1) await expect(region.getByRole("button", { name: `Copy code ${n}`, exact: true })).toBeVisible();
  await expect(region.getByRole("button", { name: /^Copy code \d+$/ })).toHaveCount(5);
  await expectNoHorizontalOverflow(page);

  const copyAll = region.getByRole("button", { name: "Copy all", exact: true });
  await hydrated(copyAll);
  await copyAll.click();
  await expect.poll(() => clipboard(page)).toBe(codes.join("\n"));
  expect((await clipboard(page)).split("\n")).toHaveLength(5);

  const third = region.getByRole("button", { name: "Copy code 3", exact: true });
  await hydrated(third);
  await third.click();
  await expect.poll(() => clipboard(page)).toBe(codes[2]);

  // 6. Ten units: the stock cannot cover them, so the order stays pending (nothing was taken). The text promises no time.
  expect(await availableCodes(packs.id), "the packs service holds fewer than 10 codes, so a 10-unit order cannot be filled").toBeLessThan(10);
  const waiting = await buyFromBalance(page, email, packs.id, 10);
  await page.goto(`/en/track/${waiting.trackingToken}`);
  const pending = main.getByText(store.track.pendingText, { exact: true });
  await expect(pending).toBeVisible();
  expect(await pending.textContent()).not.toMatch(PROMISES_A_TIME);
  await expect(main.getByText("Pending", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/processed shortly/i)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Your codes" })).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "Result", exact: true })).toHaveCount(0);

  // 7. Staff finish the waiting order with a reply in words: it is not a list of codes, so it stays one block with one Copy button.
  // The last line is one 130-character token with no space (a link): the block must wrap it, not stretch the page sideways
  // (the mobile project catches it: 130 characters are about 1000 px wide).
  const replyText = ["Done: restart the phone and insert a new SIM.", "Then wait one minute.", `https://example.com/${"x".repeat(110)}`].join("\n");
  await completeOrder(waiting.id, replyText);
  await page.goto(`/en/track/${waiting.trackingToken}`);
  await expect(main.getByText("Completed", { exact: true }).first()).toBeVisible();
  const reply = main.locator("pre");
  await expect(reply).toContainText("Done: restart the phone and insert a new SIM.");
  await expect(reply).toContainText("Then wait one minute.");
  await expect(reply).toContainText("x".repeat(110));
  await expect(page.getByRole("region", { name: "Your codes" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await expect(main.getByRole("button", { name: "Copy", exact: true })).toHaveCount(1);
  const copyReply = main.getByRole("button", { name: "Copy", exact: true });
  await hydrated(copyReply);
  await copyReply.click();
  await expect.poll(() => clipboard(page)).toBe(replyText);
});
