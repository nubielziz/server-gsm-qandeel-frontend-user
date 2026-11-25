// Home sections and the category menu (plan F31, BH §2.3 and §2.7): "Best sellers" (the API's `popular` sort, newest
// first) beside "How it works", "New arrivals" (its `listedAt` sort) after the featured collections, and the categories of
// `GET /store/v1/categories` with their service count in the header: an "All categories" menu on a desktop, a block in the
// drawer on a phone. The tests read the same API through the site's own rewrite (`/store/v1/*`) and compare, so they
// follow the demo data instead of repeating it. Nothing here changes data. The site caches catalog reads for up to
// 30 s (plan D14) and other specs place orders, which can move the best sellers: values that come from the catalog are read
// through `toPass` with a reload (F03 rules).
// The last group is the header and the home page by rank: one account menu with one Sign out and no price list for any rank
// (decision 003), the balance box with the same addresses for both ranks, and the currency choice kept on a retail account
// only. Every test that signs in uses a throwaway account (`freshAccount`).
import { type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { freshAccount, go } from "./helpers";

type ApiCategory = { id: number; slug: string; name: string; serviceCount: number };
type ApiService = { slug: string; title: string };

/** Section and menu texts, as the visitor reads them. */
const TEXT = {
  bestSellers: "Best sellers",
  newArrivals: "New arrivals",
  viewAll: "View all",
  allCategories: "All categories",
  categories: "Categories",
  openMenu: "Open menu",
  menu: "Menu",
  navRow: ["All services", "IMEI services", "Server services", "File services", "Remote services", "Track an order", "Help center", "Support"],
} as const;

/** A row of the home sections holds this many cards at most. */
const CARDS = 4;
/** The width from which the shop header shows the nav row (Tailwind `lg`); under it the menu button opens a drawer. */
const DESKTOP_NAV = 1024;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The categories the API lists (only ones with a service), through the site's rewrite. */
async function apiCategories(request: APIRequestContext): Promise<ApiCategory[]> {
  const res = await request.get("/store/v1/categories");
  expect(res.status(), await res.text()).toBe(200);
  const categories = ((await res.json()) as { categories: ApiCategory[] }).categories;
  return categories.filter((category) => category.serviceCount > 0);
}

/** The first rows of the API's list in a sort, newest or best first, in USD (what a visitor without a currency cookie sees). */
async function apiServices(request: APIRequestContext, sort: "popular" | "listedAt"): Promise<{ rows: ApiService[]; total: number }> {
  const res = await request.get(`/store/v1/services?currency=USD&_sort=${sort}&_order=desc&_start=0&_end=${CARDS}`);
  expect(res.status(), await res.text()).toBe(200);
  return { rows: (await res.json()) as ApiService[], total: Number(res.headers()["x-total-count"]) };
}

/** The accessible name of a category link: its name, then its `serviceCount` in brackets ("Apple (2)"). */
const categoryName = (category: ApiCategory) => new RegExp(`^${escapeRegExp(category.name)}\\s*\\(${category.serviceCount}\\)$`);

const servicesText = (n: number) => (n === 1 ? "1 service" : `${n} services`);

const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

/** The titles of a section's cards, in order. */
const titlesOf = (section: Locator) => section.getByRole("article").getByRole("heading", { level: 3 }).allInnerTexts();

/** The title links of a section's cards, as paths, in order. */
const hrefsOf = (section: Locator) => section.getByRole("article").locator("h3 a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));

/** Whether the page shows the phone layout (the menu button and the drawer) instead of the nav row. */
const narrow = (page: Page) => (page.viewportSize()?.width ?? 0) < DESKTOP_NAV;

/**
 * Opens the list of category links as the visitor does: on a desktop the "All categories" menu, on a phone the drawer and
 * its "Categories" block. Returns the element that holds the links.
 */
async function openCategories(page: Page): Promise<Locator> {
  const text = TEXT;
  if (!narrow(page)) {
    await page.getByRole("button", { name: text.allCategories, exact: true }).click();
    const panel = page.getByRole("navigation", { name: text.categories, exact: true });
    await expect(panel).toBeVisible();
    return panel;
  }
  await page.getByRole("button", { name: text.openMenu, exact: true }).click();
  const drawer = page.getByRole("dialog", { name: text.menu, exact: true });
  await expect(drawer).toBeVisible();
  await drawer.locator("summary", { hasText: text.categories }).click();
  const list = drawer.locator("details ul");
  await expect(list).toBeVisible();
  return list;
}

/** Every category of the API is a link with its count that opens the catalog filtered by it, and nothing else is listed. */
async function expectEveryCategory(list: Locator, categories: ApiCategory[]) {
  await expect(list.getByRole("link")).toHaveCount(categories.length);
  for (const category of categories) {
    await expect(list.getByRole("link", { name: categoryName(category) })).toHaveAttribute("href", `/en/services?category=${category.slug}`);
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
  const [scroll, client] = await page.locator("header").first().evaluate((element) => [element.scrollWidth, element.clientWidth]);
  expect(scroll, "the header content is wider than the header").toBeLessThanOrEqual(client);
}

/** A control lies inside the viewport, on both sides. */
async function expectInsideViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box, "the control is not on screen").not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
}

test.describe("sections", () => {
  test("best sellers and new arrivals show at most four cards, and their View all links carry the sort", async ({ page, request }) => {
    const [popular, listed] = await Promise.all([apiServices(request, "popular"), apiServices(request, "listedAt")]);
    await page.goto("/en");
    const best = region(page, TEXT.bestSellers);
    const fresh = region(page, TEXT.newArrivals);
    await expect(best.getByRole("article")).toHaveCount(Math.min(popular.total, CARDS));
    await expect(fresh.getByRole("article")).toHaveCount(Math.min(listed.total, CARDS));
    expect(popular.total, "the demo catalog has services").toBeGreaterThan(0);
    await expect(best.getByRole("heading", { level: 2, name: TEXT.bestSellers })).toBeVisible();
    await expect(fresh.getByRole("heading", { level: 2, name: TEXT.newArrivals })).toBeVisible();
    await expect(best.getByRole("link", { name: TEXT.viewAll })).toHaveAttribute("href", "/en/services?sort=popular");
    await expect(fresh.getByRole("link", { name: TEXT.viewAll })).toHaveAttribute("href", "/en/services?sort=newest");

    // The link opens the whole list in that sort. With cacheComponents the home page stays in the DOM, hidden, after the
    // navigation and keeps its own list toolbar, so the control is found by role (display:none elements are left out).
    await best.getByRole("link", { name: TEXT.viewAll }).click();
    await expect(page).toHaveURL(/\/en\/services\?sort=popular$/);
    await expect(page.getByRole("combobox", { name: "Sort by" })).toHaveValue("popular");
    await expect(page.getByRole("article").first()).toBeVisible();
  });

  test("the first best seller is the API's first row for the popular sort, and the new arrivals follow listedAt", async ({ page, request }) => {
    await expect(async () => {
      await page.goto("/en");
      const [popular, listed] = await Promise.all([apiServices(request, "popular"), apiServices(request, "listedAt")]);
      expect(popular.rows.length).toBeGreaterThan(0);
      const best = region(page, TEXT.bestSellers);
      const fresh = region(page, TEXT.newArrivals);
      await expect(best.getByRole("article").first()).toBeVisible();
      await expect(fresh.getByRole("article").first()).toBeVisible();

      // Best sellers = `_sort=popular&_order=desc`: the first card is the first row, and the four cards are the first four.
      const bestHrefs = await hrefsOf(best);
      expect(bestHrefs[0]).toBe(`/en/services/${encodeURIComponent(popular.rows[0].slug)}`);
      expect(await titlesOf(best)).toEqual(popular.rows.map((row) => row.title));
      // New arrivals = `_sort=listedAt&_order=desc`.
      expect(await hrefsOf(fresh)).toEqual(listed.rows.map((row) => `/en/services/${encodeURIComponent(row.slug)}`));
      expect(await titlesOf(fresh)).toEqual(listed.rows.map((row) => row.title));
    }).toPass({ timeout: 90_000, intervals: [5_000] });
  });
});

test.describe("category menu", () => {
  test("lists every category with its count; a click opens the filtered list with the same total", async ({ page, request }) => {
    test.skip(narrow(page), "a phone has the drawer's list (next test)");
    let categories: ApiCategory[] = [];
    await expect(async () => {
      await go(page, "/en");
      categories = await apiCategories(request);
      expect(categories.length, "the demo catalog has categories with services").toBeGreaterThan(0);
      await expectEveryCategory(await openCategories(page), categories);
    }).toPass({ timeout: 90_000, intervals: [5_000] });

    // The panel closes with Esc and gives the focus back to its button.
    const trigger = page.getByRole("button", { name: TEXT.allCategories, exact: true });
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("navigation", { name: TEXT.categories, exact: true })).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();

    // A click lands on the catalog filtered by that category: as many cards as the menu said (it fits one page of 24).
    const target = categories.find((category) => category.serviceCount <= 24);
    expect(target, "a category fits one page").toBeDefined();
    const list = await openCategories(page);
    await list.getByRole("link", { name: categoryName(target!) }).click();
    await expect(page).toHaveURL(new RegExp(`/en/services\\?category=${escapeRegExp(target!.slug)}$`));
    await expect(page.getByRole("heading", { level: 1, name: "All services" })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(target!.serviceCount);
    // Only visible matches count: the hidden home page (see above) holds the same text.
    await expect(page.getByText(servicesText(target!.serviceCount), { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: `Remove filter: ${target!.name}` })).toBeVisible();
    // The header is the same on every shop page.
    await expect(page.getByRole("button", { name: TEXT.allCategories, exact: true })).toBeVisible();
  });

  test("the keyboard opens the menu: Arrow Down on the button moves into the list", async ({ page, request }) => {
    test.skip(narrow(page), "a phone has the drawer's list");
    const categories = await apiCategories(request);
    await go(page, "/en");
    const trigger = page.getByRole("button", { name: TEXT.allCategories, exact: true });
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    const panel = page.getByRole("navigation", { name: TEXT.categories, exact: true });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("link").first()).toBeFocused();
    if (categories.length > 1) {
      await page.keyboard.press("ArrowDown");
      await expect(panel.getByRole("link").nth(1)).toBeFocused();
    }
  });

  test("the drawer of a phone lists the categories in a Categories block, and a link closes the drawer", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let categories: ApiCategory[] = [];
    await expect(async () => {
      await go(page, "/en");
      categories = await apiCategories(request);
      expect(categories.length, "the demo catalog has categories with services").toBeGreaterThan(0);
      await expectEveryCategory(await openCategories(page), categories);
    }).toPass({ timeout: 90_000, intervals: [5_000] });

    const drawer = page.getByRole("dialog", { name: TEXT.menu, exact: true });
    const target = categories[0];
    await drawer.getByRole("link", { name: categoryName(target) }).click();
    await expect(page).toHaveURL(new RegExp(`/en/services\\?category=${escapeRegExp(target.slug)}$`));
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("article")).toHaveCount(Math.min(target.serviceCount, 24));
  });
});

test.describe("narrow screens", () => {
  test("nothing scrolls sideways at 360 px, with the drawer's categories open", async ({ page, request }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const categories = await apiCategories(request);
    await go(page, "/en");
    // Wait for the sections to stream in before measuring the page.
    await expect(region(page, TEXT.bestSellers).getByRole("article").first()).toBeVisible();
    await expect(region(page, TEXT.newArrivals).getByRole("article").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const list = await openCategories(page);
    const drawer = page.getByRole("dialog", { name: TEXT.menu, exact: true });
    const [scroll, client] = await drawer.evaluate((element) => [element.scrollWidth, element.clientWidth]);
    expect(scroll, "the drawer content is wider than the drawer").toBeLessThanOrEqual(client);
    for (const category of categories) await expectInsideViewport(page, list.getByRole("link", { name: categoryName(category) }));
    await expectNoHorizontalOverflow(page);
  });

  test("the nav row holds the menu button at 1024 px, the narrowest desktop", async ({ page, request }) => {
    await page.setViewportSize({ width: DESKTOP_NAV, height: 800 });
    const categories = await apiCategories(request);
    await go(page, "/en");
    const trigger = page.getByRole("button", { name: TEXT.allCategories, exact: true });
    await expect(trigger).toBeVisible();
    await expectNoHorizontalOverflow(page);
    // Every link of the row ends inside the screen and none wraps onto a second line (a link is one 44 px line).
    const header = page.locator("header").first();
    const row = [trigger, ...TEXT.navRow.map((name) => header.getByRole("link", { name, exact: true }))];
    for (const item of row) {
      await expectInsideViewport(page, item);
      expect((await item.boundingBox())?.height ?? Infinity, "a nav item wraps onto a second line").toBeLessThanOrEqual(48);
    }

    // The open panel lies inside the screen.
    const list = await openCategories(page);
    await expect(list.getByRole("link")).toHaveCount(categories.length);
    await expectInsideViewport(page, list);
  });
});

/** The account menu's panel, opened. */
async function openAccountMenu(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Account menu" }).click();
  const panel = page.locator("[popover]").filter({ has: page.getByRole("button", { name: "Sign out", exact: true }) });
  await expect(panel).toBeVisible();
  return panel;
}

test.describe("the header and the home page by rank", () => {
  test("a visitor sees no link to a merchant area; the footer leads to the merchant page", async ({ page }) => {
    await go(page, "/en");
    const header = page.locator("header").first();
    await expect(header.getByRole("link", { name: "For merchants" })).toHaveCount(0);
    await expect(header.locator('a[href^="/en/merchant"]')).toHaveCount(0);
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "Become a merchant" })).toHaveAttribute("href", "/en/become-a-merchant");
    await expect(footer.getByRole("link", { name: "Merchant portal" })).toHaveCount(0);
    await expect(footer.locator('a[href^="/en/merchant"]')).toHaveCount(0);
    // The merchants banner of the home page leads to the same page.
    const banner = page.getByRole("main").getByRole("link", { name: "Become a merchant" }).filter({ visible: true });
    await expect(banner).toHaveAttribute("href", "/en/become-a-merchant");
  });

  test("a retail account has one menu: the account pages, no price list, no merchant portal and one Sign out", async ({ page }) => {
    await freshAccount(page, { signedIn: true });
    await go(page, "/en");
    const menu = await openAccountMenu(page);
    await expect(menu.getByRole("link", { name: "My account", exact: true })).toHaveAttribute("href", "/en/account");
    await expect(menu.getByRole("link", { name: "My orders", exact: true })).toHaveAttribute("href", "/en/account/orders");
    await expect(menu.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute("href", "/en/account/settings");
    await expect(menu.getByRole("link", { name: "Price list", exact: true })).toHaveCount(0);
    await expect(menu.getByRole("link", { name: "Merchant portal" })).toHaveCount(0);
    await expect(menu.getByRole("button", { name: /Sign out/ })).toHaveCount(1);
    await expect(menu.locator('a[href^="/en/merchant"]')).toHaveCount(0);
    // The rank chip names the account's own rank, and the home page has no price-list banner for it.
    const me = (await (await page.request.get("/store/v1/me")).json()) as { rank: { name: string } };
    await expect(menu.getByText(me.rank.name, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: "See my prices" })).toHaveCount(0);
  });

  test("a merchant rank has the same menu, with no price list and no banner pointing to one (decision 003)", async ({ page }) => {
    await freshAccount(page, { rank: "merchant", signedIn: true });
    await go(page, "/en");
    await expect(page.getByRole("link", { name: "See my prices" })).toHaveCount(0);
    const menu = await openAccountMenu(page);
    await expect(menu.getByRole("link", { name: "My account", exact: true })).toHaveAttribute("href", "/en/account");
    await expect(menu.getByRole("link", { name: "Wallet", exact: true })).toHaveAttribute("href", "/en/account/wallet");
    await expect(menu.getByRole("link", { name: "Price list", exact: true })).toHaveCount(0);
    await expect(menu.locator('a[href^="/en/account/services"]')).toHaveCount(0);
    await expect(menu.getByRole("link", { name: "Merchant portal" })).toHaveCount(0);
    await expect(menu.getByRole("button", { name: /Sign out/ })).toHaveCount(1);
    await expect(menu.locator('a[href^="/en/merchant"]')).toHaveCount(0);
  });

  test("the balance box adds funds at the same address for both ranks", async ({ page }) => {
    for (const rank of ["retail", "merchant"] as const) {
      await page.context().clearCookies();
      await freshAccount(page, { rank, signedIn: true });
      await go(page, "/en");
      const main = page.getByRole("main");
      await expect(main.getByRole("link", { name: "Open wallet" }).filter({ visible: true })).toHaveAttribute("href", "/en/account/wallet");
      await expect(main.getByRole("link", { name: "Add funds" }).filter({ visible: true })).toHaveAttribute("href", "/en/account/wallet/add-funds");
    }
  });

  test("Sign out ends the session and the header offers Sign in again", async ({ page }) => {
    await freshAccount(page, { signedIn: true });
    await go(page, "/en");
    const menu = await openAccountMenu(page);
    await menu.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.locator("header").first().getByRole("link", { name: "Sign in" }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Account menu" })).toHaveCount(0);
  });

  test("the currency choice is kept on a retail account and on no other", async ({ page }) => {
    const patches: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH" && new URL(request.url()).pathname === "/store/v1/me") patches.push(request.postData() ?? "");
    });
    /** Picks the first currency that is not the current one; false when the shop has just one. */
    async function pickOtherCurrency(): Promise<string | null> {
      const select = page.getByRole("combobox", { name: "Currency" }).filter({ visible: true }).first();
      await select.waitFor({ timeout: 10_000 }).catch(() => undefined);
      if ((await select.count()) === 0) return null;
      const options = await select.locator("option").allInnerTexts();
      const current = await select.inputValue();
      const other = options.find((code) => code !== current);
      if (!other) return null;
      await select.selectOption(other);
      await expect.poll(() => page.evaluate(() => document.cookie)).toContain(other);
      return other;
    }

    await freshAccount(page, { signedIn: true });
    await go(page, "/en");
    const first = await pickOtherCurrency();
    test.skip(first === null, "the demo shop has one currency");
    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0]).toBe(JSON.stringify({ currency: first }));

    patches.length = 0;
    await page.context().clearCookies();
    await freshAccount(page, { rank: "merchant", signedIn: true });
    await go(page, "/en");
    expect(await pickOtherCurrency()).not.toBeNull();
    // Give a wrongly sent request time to leave before counting.
    await page.waitForTimeout(500);
    expect(patches, "a merchant rank keeps the choice in the cookie only").toHaveLength(0);
  });
});
