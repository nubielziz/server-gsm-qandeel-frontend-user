// Dialogs that open from the server HTML (plan P4.1): the shop's menu drawer and the checkout's "Service requirements"
// drawer are uncontrolled <dialog>s opened by invoker commands (`command="show-modal" commandfor=…`), so a tap works
// from first paint, not only after hydration (13 of 15 early taps were lost before). The specs block every client
// script (`/_next/static/chunks/**`; the CSS still loads), so React never hydrates, then tap. Inline scripts still run,
// so streamed Suspense content still shows. A last spec checks the hydrated page: the click handler and the command
// do not fight, and a link in the drawer closes it. The phone search row is a popover opened by its button's
// `popovertarget`: a tap before hydration opens it and its field (`autofocus`) has the focus, so a phone opens its
// keyboard (feature 29). Nothing here changes data.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { go } from "./helpers";

/** The width from which the shop header shows the nav row (Tailwind `lg`); under it the menu button opens the drawer. */
const DESKTOP_NAV = 1024;

const TEXT = {
  en: { openMenu: "Open menu", menu: "Menu", close: "Close", trackOrder: "Track an order", openSearch: "Open search", search: "Search services" },
  ar: { openMenu: "فتح القائمة", menu: "القائمة", close: "إغلاق", trackOrder: "تتبّع طلب", openSearch: "فتح البحث", search: "ابحث في الخدمات" },
} as const;

const SERVICE = "/en/checkout?service=icloud-clean-lost-check";
const IMEI = "490154203237518";

/** Whether the page shows the phone header (the menu button) instead of the nav row. */
const narrow = (page: Page) => (page.viewportSize()?.width ?? 0) < DESKTOP_NAV;

/**
 * Aborts every client script (the CSS still loads), so the page stays styled server HTML. Turbopack serves the
 * stylesheets from the same `/_next/static/chunks/` folder, so only script requests are aborted. Returns how many
 * script requests were aborted so far.
 */
async function withoutClientJs(page: Page): Promise<() => number> {
  let aborted = 0;
  await page.route("**/_next/static/chunks/**", (route) => {
    if (route.request().resourceType() !== "script") return route.continue();
    aborted += 1;
    return route.abort();
  });
  return () => aborted;
}

/** Whether React has attached its props to the element (it has hydrated). */
const hydrated = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps")));

test.describe("before hydration", () => {
  for (const locale of ["en", "ar"] as const) {
    test(`${locale}: the menu button opens the drawer as a modal; its close button and Esc close it and focus returns`, async ({ page }) => {
      test.skip(!narrow(page), "the menu button shows only under lg");
      const aborted = await withoutClientJs(page);
      await page.goto(`/${locale}`);
      expect(aborted(), "no client script was blocked").toBeGreaterThan(0);

      const button = page.getByRole("button", { name: TEXT[locale].openMenu, exact: true });
      await expect(button).toHaveAttribute("aria-haspopup", "dialog");
      expect(await hydrated(page, "header button[commandfor]"), "the page hydrated").toBe(false);

      await button.click();
      const drawer = page.getByRole("dialog", { name: TEXT[locale].menu, exact: true });
      await expect(drawer).toBeVisible();
      // A modal: the focus trap and the inert page come from showModal(), not from a plain `open` attribute.
      expect(await drawer.evaluate((element) => element.matches(":modal"))).toBe(true);
      await expect(drawer.getByRole("link").first()).toBeVisible();

      await drawer.getByRole("button", { name: TEXT[locale].close, exact: true }).click();
      await expect(drawer).toBeHidden();
      await expect(button).toBeFocused();

      await button.click();
      await expect(drawer).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(button).toBeFocused();
    });
  }

  for (const locale of ["en", "ar"] as const) {
    test(`${locale}: the search button opens the phone search row and its field has the focus`, async ({ page }) => {
      test.skip(!narrow(page), "the search button shows only under lg");
      const aborted = await withoutClientJs(page);
      await page.goto(`/${locale}`);
      expect(aborted(), "no client script was blocked").toBeGreaterThan(0);

      const button = page.getByRole("banner").getByRole("button", { name: TEXT[locale].openSearch, exact: true });
      expect(await hydrated(page, "header button[popovertarget]"), "the page hydrated").toBe(false);
      const mainTop = async () => (await page.locator("main").boundingBox())?.y;
      const before = await mainTop();
      await button.click();
      // Before hydration the field is the plain search box (the combobox comes with the first interaction after it).
      const field = page.getByRole("banner").getByRole("searchbox", { name: TEXT[locale].search, exact: true });
      await expect(field).toBeVisible();
      await expect(field).toBeFocused();
      // The row lies over the page: opening it moved nothing below the header.
      expect(await mainTop()).toBe(before);
      await page.keyboard.press("Escape");
      await expect(field).toBeHidden();
    });
  }

  test("checkout: Enter details opens the requirements drawer; Cancel closes it; Save does not leave the page", async ({ page }) => {
    const aborted = await withoutClientJs(page);
    await page.goto(SERVICE);
    expect(aborted(), "no client script was blocked").toBeGreaterThan(0);
    await expect(page.getByRole("heading", { level: 1, name: "Secure checkout" })).toBeVisible();

    const trigger = page.getByRole("button", { name: "Enter details" }).first();
    await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(await hydrated(page, "main button[commandfor]"), "the page hydrated").toBe(false);

    await trigger.click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByLabel("IMEI number")).toBeVisible();
    expect(await drawer.evaluate((element) => element.matches(":modal"))).toBe(true);
    await drawer.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();

    // The drawer's form is `method="dialog"`: before hydration Save only closes it, with no GET that would drop
    // `?service=` and put the IMEI in the address.
    await trigger.click();
    await drawer.getByLabel("IMEI number").fill(IMEI);
    await page.getByRole("button", { name: "Save details and continue" }).click();
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/\/en\/checkout\?service=icloud-clean-lost-check$/);
  });
});

test.describe("after hydration", () => {
  test("the search button toggles the phone search row once per tap, the field focused", async ({ page }) => {
    test.skip(!narrow(page), "the search button shows only under lg");
    await go(page, "/en");
    const banner = page.getByRole("banner");
    await expect.poll(() => hydrated(page, "header button[popovertarget]")).toBe(true);
    await banner.getByRole("button", { name: TEXT.en.openSearch, exact: true }).click();
    const field = banner.getByRole("combobox", { name: TEXT.en.search });
    await expect(field).toBeVisible();
    await expect(field).toBeFocused();
    await banner.getByRole("button", { name: "Close search", exact: true }).click();
    await expect(field).toBeHidden();
  });

  test("the menu opens once per tap and a link inside it closes it", async ({ page }) => {
    test.skip(!narrow(page), "the menu button shows only under lg");
    await go(page, "/en");
    const button = page.getByRole("button", { name: TEXT.en.openMenu, exact: true });
    await expect.poll(() => hydrated(page, "header button[commandfor]")).toBe(true);

    // The click handler opens it first and the native command then finds it open: one modal, no error.
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await button.click();
    const drawer = page.getByRole("dialog", { name: TEXT.en.menu, exact: true });
    await expect(drawer).toBeVisible();
    expect(await drawer.evaluate((element) => element.matches(":modal"))).toBe(true);

    await drawer.getByRole("link", { name: TEXT.en.trackOrder, exact: true }).click();
    await expect(page).toHaveURL(/\/en\/track$/);
    await expect(drawer).toBeHidden();
    expect(errors).toEqual([]);
  });
});
