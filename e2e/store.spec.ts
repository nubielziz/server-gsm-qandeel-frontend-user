// Public store: home, catalog filters, service page, language switch by service id, IMEI check, order tracking.
// Real browser → Next → the isolated demo backend (:3100). The Cloudflare script is replaced by a stub that hands out the
// backend's dev token, so the tests do not depend on the internet.
import { expect, test } from "./fixtures";
import { type APIRequestContext, type Page } from "@playwright/test";

/** The token the backend's dev Turnstile verifier accepts (handoff §3.10). */
const DEV_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

async function stubTurnstile(page: Page) {
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `(function(){var o={};window.turnstile={render:function(e,c){var id="w"+Math.random();o[id]=c;setTimeout(function(){c.callback("${DEV_TOKEN}")},30);return id},reset:function(id){var c=o[id];if(c)setTimeout(function(){c.callback("${DEV_TOKEN}")},30)},remove:function(id){delete o[id]}}})();`,
    }),
  );
}

type ApiCategory = { id: number; slug: string; name: string; serviceCount: number };

/** The categories the API lists (`GET /store/v1/categories`), read through the site's own rewrite. */
async function apiCategories(request: APIRequestContext, locale: "en" | "ar" = "en"): Promise<ApiCategory[]> {
  const res = await request.get(`/store/v1/categories?locale=${locale}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { categories: ApiCategory[] }).categories;
}

/** The accessible name of a category's checkbox in the sidebar: its name, then its `serviceCount` in brackets. */
const categoryCheckbox = (category: ApiCategory) =>
  new RegExp(`^${category.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(${category.serviceCount}\\)`);

test.describe("home", () => {
  test("shows featured services priced in USD, brand and carrier tiles and the quick IMEI form", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("IMEI checks");
    const featured = page.getByRole("region", { name: "Featured services" });
    await expect(featured.getByRole("article")).not.toHaveCount(0);
    await expect(featured.getByText("$25.99")).toBeVisible();
    await expect(featured.getByRole("link", { name: /^Order AT&T USA Premier Unlock/ })).toHaveAttribute(
      "href",
      "/en/checkout?service=atandt-usa-premier-unlock",
    );
    await expect(page.getByText("Starting from")).toBeVisible();
    const tiles = page.getByRole("navigation", { name: "Shop by brand or carrier" });
    await expect(tiles.getByRole("link", { name: "Apple 8 services" })).toHaveAttribute("href", "/en/services?brand=Apple");
    await expect(tiles.getByRole("link", { name: "AT&T 1 service" })).toHaveAttribute("href", "/en/services?network=AT%26T");
    await expect(tiles.getByRole("link", { name: "All services 11 services" })).toHaveAttribute("href", "/en/services");
    const bestSellers = page.getByRole("region", { name: "Best sellers" });
    await expect(bestSellers.getByRole("article")).toHaveCount(4);

    // The quick check hands the number to the IMEI page.
    await page.getByLabel("IMEI number").first().fill("490154203237518");
    await page.getByRole("button", { name: "Check IMEI" }).first().click();
    await expect(page).toHaveURL(/\/en\/imei-check\?imei=490154203237518/);
  });

  test("featured collections are the biggest brands and countries and open the filtered catalog", async ({ page }) => {
    await page.goto("/en");
    const collections = page.getByRole("region", { name: "Featured collections" });
    await expect(collections.getByRole("listitem")).toHaveCount(3);
    await expect(collections.getByRole("link", { name: "Explore collection: Apple" })).toHaveAttribute("href", "/en/services?brand=Apple");
    await expect(collections.getByRole("link", { name: "Explore collection: United States" })).toHaveAttribute(
      "href",
      "/en/services?country=US",
    );
    await expect(collections.getByText("8 services")).toBeVisible();
  });

  test("all services: 8 per page, sidebar checkboxes with counts, search; the state is in the home URL", async ({ page, request, isMobile }) => {
    await page.goto("/en");
    const list = page.getByRole("region", { name: /^All services/ });
    await expect(list.getByRole("article")).toHaveCount(8);
    await expect(list.getByText("Showing 1 to 8 of 11")).toBeVisible();

    await list.getByRole("link", { name: "Next page" }).click();
    await expect(page).toHaveURL(/\/en\?page=2#all-services$/);
    await expect(list.getByRole("article")).toHaveCount(3);

    // Sidebar on a desktop, drawer on a phone. A ticked box applies at once and starts again at page 1; several
    // options of one list add up.
    if (isMobile) await list.getByRole("button", { name: /^Filters/ }).click();
    const filters = isMobile ? page.getByRole("dialog", { name: "Filters" }) : list.getByRole("complementary", { name: "Filters" });
    // "Categories" holds the API's real categories with their service count; the four service types sit under "Service type".
    const category = (await apiCategories(request)).find((c) => c.serviceCount > 0);
    expect(category, "the demo catalog has a category with services").toBeDefined();
    await expect(filters.getByRole("group", { name: "Categories" }).getByRole("checkbox", { name: categoryCheckbox(category!) })).toBeVisible();
    await expect(filters.getByRole("group", { name: "Service type" }).getByRole("checkbox", { name: /^IMEI check/ })).toBeVisible();
    const brands = filters.getByRole("group", { name: "Brand" });
    await expect(brands.getByText("(8)")).toBeVisible();
    await brands.getByRole("checkbox", { name: /^Samsung/ }).check();
    await expect(page).toHaveURL(/\/en\?brand=Samsung$/);
    await expect(brands.getByRole("checkbox", { name: /^Samsung/ })).toBeChecked();
    await brands.getByRole("checkbox", { name: /^Apple/ }).check();
    await expect(page).toHaveURL(/\/en\?brand=Apple&brand=Samsung$/);
    if (isMobile) await filters.getByRole("button", { name: "Show results" }).click();
    await expect(list.getByText("10 services")).toBeVisible();
    await expect(list.getByRole("link", { name: "Remove filter: Samsung" })).toBeVisible();

    // A chip removes one value; the search keeps the rest.
    await list.getByRole("link", { name: "Remove filter: Apple" }).click();
    await expect(page).toHaveURL(/\/en\?brand=Samsung#all-services$/);
    await expect(list.getByRole("article")).toHaveCount(2);
    const search = list.getByRole("searchbox", { name: "Search" });
    await search.fill("kg lock");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/en\?brand=Samsung&q=kg\+lock#all-services$/);
    await expect(list.getByRole("article")).toHaveCount(1);
    await expect(list.getByText("Samsung KG Lock Fix")).toBeVisible();
  });

  test("all services: the price range filters by the shown price; the slider works with the keyboard", async ({ page, isMobile }) => {
    await page.goto("/en?max=14");
    const list = page.getByRole("region", { name: /^All services/ });
    await expect(list.getByRole("article")).toHaveCount(6);
    await expect(list.getByRole("link", { name: "Remove filter: Price: $3 to $14" })).toBeVisible();
    test.skip(isMobile, "the slider is the same component in the drawer");
    const highest = list.getByRole("complementary", { name: "Filters" }).getByRole("slider", { name: "Maximum price" });
    await expect(highest).toHaveValue("14");
    await highest.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(/\/en\?max=16$/);
    await expect(list.getByText("8 services")).toBeVisible();
    await expect(highest).toBeFocused();
  });

  test("quick view opens a service in a dialog over the page; Esc closes it and the page stays", async ({ page }) => {
    await page.goto("/en");
    const featured = page.getByRole("region", { name: "Featured services" });
    await featured.getByRole("link", { name: "Quick view: AT&T USA Premier Unlock" }).click();
    const dialog = page.getByRole("dialog", { name: "AT&T USA Premier Unlock" });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/en\/quick-view\/atandt-usa-premier-unlock$/);
    await expect(dialog.getByText("$25.99")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Buy now" })).toHaveAttribute("href", "/en/checkout?service=atandt-usa-premier-unlock");
    await expect(dialog.getByRole("link", { name: "View full details" })).toHaveAttribute("href", "/en/services/atandt-usa-premier-unlock");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/en$/);
    await expect(featured.getByRole("article")).not.toHaveCount(0);
  });

  test("a quick view link opened directly is the service page, not indexed", async ({ page }) => {
    await page.goto("/en/quick-view/atandt-usa-premier-unlock");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("AT&T USA Premier Unlock");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en\/services\/atandt-usa-premier-unlock$/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});

test.describe("catalog", () => {
  test("lists 24 per page at most, filters by brand and shows removable chips", async ({ page }) => {
    await page.goto("/en/services?brand=Samsung");
    await expect(page.getByRole("heading", { level: 1, name: "All services" })).toBeVisible();
    const cards = page.getByRole("article");
    await expect(cards).toHaveCount(2);
    await expect(page.getByRole("link", { name: "Samsung Info (KG / FRP / Region)", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Remove filter: Samsung" })).toBeVisible();
    await page.getByRole("link", { name: "Remove filter: Samsung" }).click();
    await expect(page).toHaveURL(/\/en\/services$/);
    await expect(cards).toHaveCount(11);
  });

  test("search narrows the list and an empty result offers to clear the filters", async ({ page }) => {
    await page.goto("/en/services");
    const search = page.getByRole("searchbox", { name: "Search", exact: true });
    await search.fill("verizon");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/en\/services\?q=verizon$/);
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByText("Verizon iPhone Unlock").first()).toBeVisible();

    await page.goto("/en/services?q=zzzzzzzz");
    await expect(page.getByText("No services match your filters")).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page.getByRole("article")).toHaveCount(11);
  });

  test("has the same filter sidebar as the home page: categories, service type, price range, brand checkboxes", async ({ page, request, isMobile }) => {
    await page.goto("/en/services");
    if (isMobile) await page.getByRole("button", { name: /^Filters/ }).click();
    const filters = isMobile ? page.getByRole("dialog", { name: "Filters" }) : page.getByRole("complementary", { name: "Filters" });
    const category = (await apiCategories(request)).find((c) => c.serviceCount > 0);
    expect(category, "the demo catalog has a category with services").toBeDefined();
    await expect(filters.getByRole("group", { name: "Categories" }).getByRole("checkbox", { name: categoryCheckbox(category!) })).toBeVisible();
    await expect(filters.getByRole("group", { name: "Service type" }).getByRole("checkbox", { name: /^IMEI check/ })).toBeVisible();
    await expect(filters.getByRole("slider", { name: "Maximum price" })).toHaveValue("26");
    await filters.getByRole("group", { name: "Brand" }).getByRole("checkbox", { name: /^Samsung/ }).check();
    await expect(page).toHaveURL(/\/en\/services\?brand=Samsung$/);
    if (isMobile) await filters.getByRole("button", { name: "Show results" }).click();
    await expect(page.getByRole("article")).toHaveCount(2);
  });

  test("the Arabic catalog lists the Arabic listings only", async ({ page }) => {
    await page.goto("/ar/services");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("جميع الخدمات");
    await expect(page.getByRole("article")).toHaveCount(5);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});

test.describe("service page", () => {
  test("shows the price, delivery rule and a Buy now link to checkout", async ({ page }) => {
    await page.goto("/en/services/atandt-usa-premier-unlock");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("AT&T USA Premier Unlock");
    await expect(page.getByRole("complementary").getByText("$25.99")).toBeVisible();
    await expect(page.getByText("Tax is added at checkout")).toBeVisible();
    await expect(page.getByRole("link", { name: "Buy now" })).toHaveAttribute(
      "href",
      "/en/checkout?service=atandt-usa-premier-unlock",
    );
    await expect(page).toHaveTitle(/AT&T USA Premier Unlock/);
  });

  test("a slug of the other language redirects to this language's slug of the same service (matched by id)", async ({ page }) => {
    await page.goto("/ar/services/icloud-clean-lost-check");
    await expect(page).toHaveURL(/\/ar\/services\/fahs-icloud$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("فحص حالة iCloud");

    await page.goto("/en/services/fahs-icloud");
    await expect(page).toHaveURL(/\/en\/services\/icloud-clean-lost-check$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("iCloud Clean / Lost Check");
  });

  test("a service that exists only in English is a 404 in Arabic", async ({ page }) => {
    await page.goto("/ar/services/t-mobile-usa-unlock");
    await expect(page.getByRole("heading", { name: "الصفحة غير موجودة" })).toBeVisible();
  });

  test("hreflang alternates point at the other language's slug", async ({ page }) => {
    await page.goto("/en/services/icloud-clean-lost-check");
    await expect(page.locator('link[rel="alternate"][hreflang="ar"]')).toHaveAttribute("href", /\/ar\/services\/fahs-icloud$/);
  });
});

test.describe("IMEI check", () => {
  test("checks a valid IMEI and says honestly that blacklist and lock status are not available yet", async ({ page }) => {
    await stubTurnstile(page);
    await page.goto("/en/imei-check");
    await expect(page.getByRole("button", { name: "Check IMEI" })).toBeEnabled(); // hydrated, security check answered
    await page.getByLabel("IMEI number").fill("490154203237518");
    const request = page.waitForRequest((r) => r.url().endsWith("/store/v1/imei/check") && r.method() === "POST");
    await page.getByRole("button", { name: "Check IMEI" }).click();
    expect((await request).headers()["x-turnstile-token"]).toBe(DEV_TOKEN);
    await expect(page.getByRole("heading", { name: "Result" })).toBeVisible();
    await expect(page.getByText("Not available yet")).toBeVisible();
    await expect(page.getByText(/does not look up blacklist/)).toBeVisible();
    await expect(page.getByText("Valid", { exact: false }).first()).toBeVisible();
  });

  test("a prefilled IMEI from the home page is checked automatically", async ({ page }) => {
    await stubTurnstile(page);
    await page.goto("/en/imei-check?imei=490154203237518");
    await expect(page.getByRole("heading", { name: "Result" })).toBeVisible();
  });

  test("an IMEI with a wrong check digit is refused before any request", async ({ page }) => {
    await stubTurnstile(page);
    let called = false;
    page.on("request", (r) => {
      if (r.url().endsWith("/store/v1/imei/check")) called = true;
    });
    await page.goto("/en/imei-check");
    await expect(page.getByRole("button", { name: "Check IMEI" })).toBeEnabled();
    await page.getByLabel("IMEI number").fill("490154203237519");
    await page.getByRole("button", { name: "Check IMEI" }).click();
    await expect(page.getByText("last digit does not match")).toBeVisible();
    expect(called).toBe(false);
  });
});

test.describe("order tracking", () => {
  test("shows the status, the result and the timeline of a seeded order", async ({ page }) => {
    await page.goto("/en/track/t_4056k559090000000000");
    await expect(page.getByRole("heading", { level: 2, name: "Samsung Info (KG / FRP / Region)" })).toBeVisible();
    await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Not on the GSMA blacklist")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Order progress" })).toBeVisible();
    await expect(page.getByText("Order received")).toBeVisible();
    await expect(page.getByText("Payment received")).toBeVisible();
    await expect(page.getByRole("link", { name: "Download receipt" })).toHaveAttribute("href", /\/store\/v1\/orders\/t_4056k559090000000000\/receipt$/);
    await expect(page.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", /\/en\/support\?order=t_4056k559090000000000$/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("the tracking form accepts a pasted link or a bare code", async ({ page }) => {
    await page.goto("/en/track");
    await page.getByLabel("Tracking link or code").fill("not a token");
    await page.getByRole("button", { name: "Track order" }).click();
    await expect(page.getByText("Enter the tracking link or code")).toBeVisible();
    await page.getByLabel("Tracking link or code").fill("http://localhost:5175/en/track/t_3622k612620000000000?x=1");
    await page.getByRole("button", { name: "Track order" }).click();
    await expect(page).toHaveURL(/\/en\/track\/t_3622k612620000000000$/);
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  });

  test("an unknown token gets a friendly page", async ({ page }) => {
    await page.goto("/en/track/zzzzzzzzzzzzzzzzzzzz");
    await expect(page.getByText("We could not find this order")).toBeVisible();
  });

  test("the Arabic tracking page is right-to-left with translated timeline labels", async ({ page }) => {
    await page.goto("/ar/track/t_4056k559090000000000");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByText("استلمنا الطلب")).toBeVisible();
  });
});

test.describe("help center and content pages", () => {
  test("searches the help articles and opens one", async ({ page }) => {
    await page.goto("/en/help?q=refund");
    await expect(page.locator("summary", { hasText: "How do refunds work?" })).toBeVisible();
    await page.goto("/en/help/3-where-is-my-order");
    await expect(page.getByRole("heading", { level: 1, name: "Where is my order?" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Contact support" })).toBeVisible();
  });

  test("legal pages render with their version; a missing page is a 404", async ({ page }) => {
    await page.goto("/en/pages/terms");
    await expect(page.getByRole("heading", { level: 1, name: "Terms of service" })).toBeVisible();
    await expect(page.getByText("Version 3.2")).toBeVisible();
    await page.goto("/en/pages/does-not-exist");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});
