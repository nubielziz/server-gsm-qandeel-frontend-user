// The sign-in panel of the shop header (owner, 2026-11-28): the "Sign in" button opens a panel under it with the password form,
// the email link and the way to the sign-up page; a finished sign-in keeps the visitor on the page they were reading. On phones
// the header shows its icon link, which opens the sign-in page. Runs against the isolated demo backend (:3100) only.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ACCOUNTS, go } from "./helpers";

const button = (page: Page) => page.locator("header").getByRole("link", { name: "Sign in", exact: true }).and(page.locator('[aria-haspopup="dialog"]'));
const panel = (page: Page) => page.locator("header").getByRole("dialog", { name: "Sign in" });

/** Opens the panel once the button's script runs (before that a click follows the link to the sign-in page). */
async function openPanel(page: Page) {
  await expect.poll(() => button(page).evaluate((link) => Object.keys(link).some((key) => key.startsWith("__reactProps")))).toBe(true);
  await button(page).click();
  await expect(panel(page).locator('input[name="email"]')).toBeFocused();
}

test.describe("the header's sign-in panel", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "phones get the icon link to the sign-in page (its own test below)");
  });

  test("opens under the button with the three ways in, and closes on Esc with the focus back on the button", async ({ page }) => {
    await go(page, "/en/services");
    await openPanel(page);
    await expect(page).toHaveURL(/\/en\/services$/);
    await expect(button(page)).toHaveAttribute("aria-expanded", "true");

    const box = (await panel(page).boundingBox())!;
    const at = (await button(page).boundingBox())!;
    expect(box.y, "the panel sits under the button").toBeGreaterThanOrEqual(at.y + at.height);
    expect(Math.abs(box.x + box.width - (at.x + at.width)), "and lines up with its end").toBeLessThan(2);

    await expect(panel(page).getByRole("heading", { level: 2, name: "Sign in" })).toBeVisible();
    await expect(panel(page).locator('input[name="password"]')).toBeVisible();
    await expect(panel(page).getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
    await expect(panel(page).getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/en/sign-up");
    await expect(panel(page).getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/en/forgot-password");

    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    await expect(button(page)).toBeFocused();
    await expect(button(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("keeps what was typed when it is closed by a click outside and opened again", async ({ page }) => {
    await go(page, "/en/services");
    await openPanel(page);
    await panel(page).locator('input[name="email"]').fill("someone@example.com");
    await page.mouse.click(200, 600);
    await expect(panel(page)).toBeHidden();
    await button(page).click();
    await expect(panel(page).locator('input[name="email"]')).toHaveValue("someone@example.com");
    // A press on the button while the panel is open closes it, and it stays closed.
    await button(page).click();
    await expect(panel(page)).toBeHidden();
  });

  test("a wrong password is told in the panel; the right one signs in and the visitor stays on the page", async ({ page }) => {
    await go(page, "/en/services");
    await openPanel(page);
    await panel(page).locator('input[name="email"]').fill(ACCOUNTS.retail.email);
    await panel(page).locator('input[name="password"]').fill("not-the-password-1");
    await panel(page).getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(panel(page).getByText("The email or password is incorrect.")).toBeVisible();
    await expect(page).toHaveURL(/\/en\/services$/);

    await panel(page).locator('input[name="password"]').fill(ACCOUNTS.retail.password);
    await panel(page).getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("header").getByRole("button", { name: "Account menu" })).toBeVisible();
    await expect(page).toHaveURL(/\/en\/services$/);
    await expect(panel(page)).toHaveCount(0);
    expect((await page.request.get("/store/v1/me")).status()).toBe(200);
  });

  test("the email link is asked for inside the panel, and the way back to the password is there", async ({ page }) => {
    await go(page, "/en/services");
    await openPanel(page);
    await panel(page).locator('input[name="email"]').fill("nobody-here@example.test");
    await panel(page).getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(panel(page).getByRole("heading", { level: 2, name: "Email me a sign-in link" })).toBeVisible();
    // The address typed in the password form is carried over.
    await expect(panel(page).locator('input[name="email"]')).toHaveValue("nobody-here@example.test");
    await panel(page).getByRole("button", { name: "Use my password instead" }).click();
    await expect(panel(page).locator('input[name="password"]')).toBeVisible();
  });

  test("'Create an account' goes to the sign-up page", async ({ page }) => {
    await go(page, "/en/services");
    await openPanel(page);
    await panel(page).getByRole("link", { name: "Create an account" }).click();
    await expect(page).toHaveURL(/\/en\/sign-up$/);
    await expect(page.getByRole("heading", { level: 1, name: "Create your account" })).toBeVisible();
  });
});

test("on a phone the header's Sign in is a plain link to the sign-in page", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "the phone layout");
  await go(page, "/en/services");
  await expect(page.locator('header a[aria-haspopup="dialog"]')).toBeHidden();
  await page.locator("header").getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);
});
