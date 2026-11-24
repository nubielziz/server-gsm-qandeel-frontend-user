// EXCLUSIVE spec (plan F21, D7, BH §3.8): the store wallet switched OFF. It flips `wallet.customer.enabled`, a setting that
// every retail account of the isolated backend sees, so it runs only with E2E_EXCLUSIVE=1, by hand, with nothing else running:
//   E2E_EXCLUSIVE=1 E2E_RUN=$(date +%s) E2E_BASE_URL=http://localhost:5176 npx playwright test e2e/wallet-disabled.spec.ts --project=desktop
// The setting is switched back on in `finally`, whatever the test did. Both customers are throwaway and are made while the wallet
// is still on (a switched-off wallet takes no new credit).
// What it asserts: a customer with $20 still sees the balance, the statement, the nav item and the pill, but no "Add funds" and no
// balance choice in a checkout; a customer with nothing sees no nav item, no pill and no "Wallet" menu item.
import type { Locator, Page } from "@playwright/test";
import { adminCall, creditAccount } from "./admin";
import { expect, test } from "./fixtures";
import { DEV_TURNSTILE_TOKEN, freshAccount, go, signIn } from "./helpers";

test.skip(() => process.env.E2E_EXCLUSIVE !== "1", "Exclusive: it switches the customer wallet off for every customer. Run it with E2E_EXCLUSIVE=1 and nothing else running.");
test.skip(({ isMobile }) => isMobile, "One project is enough: the setting is global and the pages are the same.");

const IMEI = "490154203237518";

const main = (page: Page) => page.getByRole("main");
const vis = (locator: Locator) => locator.filter({ visible: true });
const header = (page: Page) => page.locator("header").first();
const card = (page: Page, label: string) => main(page).getByText(label, { exact: true }).locator("xpath=..");

const setWallet = (on: boolean) => adminCall("PATCH", "/admin/settings", { json: { "wallet.customer.enabled": on } });

/** Waits until the API reports the switch as the test set it (settings are cached for a moment). */
async function waitForEnabled(page: Page, enabled: boolean) {
  await expect
    .poll(async () => ((await (await page.request.get("/store/v1/me/wallet")).json()) as { enabled: boolean }).enabled, { timeout: 30_000, intervals: [500, 1_000] })
    .toBe(enabled);
}

test("a switched-off wallet still shows a balance and its statement, offers nothing to add or spend, and an empty wallet disappears", async ({ page }) => {
  // Made while the wallet is on: one retail account with $20 and one with nothing, both with a password to sign in again.
  const empty = await freshAccount(page, { signedIn: true });
  await page.context().clearCookies();
  const rich = await freshAccount(page, { signedIn: true });
  await creditAccount(rich.id, "20.0000");

  try {
    await setWallet(false);
    await waitForEnabled(page, false);

    // ── The customer with $20 (signed in): the balance, the statement and the notice stay; Add funds goes.
    await go(page, "/en/account/wallet");
    await expect(page.getByRole("heading", { level: 1, name: "Wallet" })).toBeVisible();
    await expect(card(page, "Balance")).toContainText("$20.00");
    await expect(card(page, "Available balance")).toContainText("$0.00");
    const notice = main(page).getByRole("status").filter({ hasText: "The store balance is paused" });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Your balance is kept and stays visible here.");
    await expect(main(page).getByRole("link", { name: "Add funds" })).toHaveCount(0);
    await expect(vis(main(page).getByRole("region", { name: "Statement", exact: true }).getByText("Adjustment", { exact: true }))).toHaveCount(1);
    // The rail's item and the header pill remain, because there is a balance.
    await expect(page.getByRole("link", { name: "Wallet", exact: true })).toBeVisible();
    await expect(header(page).locator('a[href="/en/account/wallet"][aria-label]')).toHaveAccessibleName("Store balance: $0.00");

    // The shop header too: the account menu keeps its Wallet item.
    await go(page, "/en");
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("link", { name: "Wallet", exact: true })).toHaveAttribute("href", "/en/account/wallet");

    // A checkout opened while signed in: no balance choice and no balance payment.
    const csrf = (await page.context().cookies()).find((cookie) => cookie.name.startsWith("csrf_token_"))?.value ?? "";
    const created = await page.request.post("/store/v1/checkout-sessions", {
      headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN, "X-CSRF-Token": csrf, "Content-Type": "application/json" },
      data: { serviceId: 1, email: rich.email, country: "DE", currency: "USD", imei: IMEI },
    });
    expect(created.status(), await created.text()).toBe(201);
    const session = (await created.json()) as { token: string; balancePayable: boolean };
    expect(session.balancePayable, "the API offers no balance payment while the wallet is off").not.toBe(true);
    await page.goto(`/en/checkout/${session.token}`);
    await expect(page.getByRole("heading", { level: 1, name: "Review and pay" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /balance/i })).toHaveCount(0);
    await expect(page.getByText(/store balance|from balance|from your balance/i)).toHaveCount(0);

    // ── The customer with nothing: no nav item, no pill, no menu item; the page, reached by address, says it is paused.
    await page.context().clearCookies();
    await signIn(page, empty);
    await go(page, "/en/account");
    await expect(page.getByRole("heading", { level: 1, name: /Welcome/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Wallet", exact: true })).toHaveCount(0);
    await expect(header(page).locator('a[href="/en/account/wallet"]')).toHaveCount(0);

    await go(page, "/en");
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("link", { name: "My orders" })).toBeVisible(); // the menu is open and loaded
    await expect(page.getByRole("link", { name: "Wallet", exact: true })).toHaveCount(0);
    await expect(page.locator('a[href="/en/account/wallet"]')).toHaveCount(0);

    await go(page, "/en/account/wallet");
    await expect(page.getByRole("heading", { level: 1, name: "Wallet" })).toBeVisible();
    await expect(main(page).getByRole("heading", { name: "The store balance is paused" })).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Back to my account" })).toHaveAttribute("href", "/en/account");
    await expect(main(page).getByRole("link", { name: "Add funds" })).toHaveCount(0);
    await expect(main(page).getByText("Available balance")).toHaveCount(0);
  } finally {
    await setWallet(true);
  }
});
