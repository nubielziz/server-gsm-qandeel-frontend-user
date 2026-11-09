// Public store: home, catalog filters, service page, language switch by service id, IMEI check, order tracking.
// Real browser → Next → the isolated demo backend (:3100). The Cloudflare script is replaced by a stub that hands out the
// backend's dev token, so the tests do not depend on the internet.
import { expect, test } from "./fixtures";
import { type Page } from "@playwright/test";

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

test.describe("home", () => {
  test("shows featured services priced in USD, brand chips and the quick IMEI form", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("IMEI checks");
    const featured = page.getByRole("region", { name: "Featured services" });
    await expect(featured.getByRole("article")).not.toHaveCount(0);
    await expect(featured.getByText("$25.99")).toBeVisible();
    await expect(featured.getByRole("link", { name: /^Order AT&T USA Premier Unlock/ })).toHaveAttribute(
      "href",
      "/en/checkout?service=atandt-usa-premier-unlock",
    );
    await expect(page.getByRole("link", { name: "Show Apple services" })).toHaveAttribute("href", "/en/services?brand=Apple");

    // The quick check hands the number to the IMEI page.
    await page.getByLabel("IMEI number").first().fill("490154203237518");
    await page.getByRole("button", { name: "Check IMEI" }).first().click();
    await expect(page).toHaveURL(/\/en\/imei-check\?imei=490154203237518/);
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

  test("search narrows the list and an empty result offers to clear the filters", async ({ page, isMobile }) => {
    await page.goto("/en/services");
    if (isMobile) await page.getByRole("button", { name: /^Filters/ }).click();
    await page.getByRole("searchbox", { name: "Search", exact: true }).fill("verizon");
    await page.getByRole("button", { name: "Show results" }).click();
    await expect(page).toHaveURL(/q=verizon/);
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByText("Verizon iPhone Unlock").first()).toBeVisible();

    await page.goto("/en/services?q=zzzzzzzz");
    await expect(page.getByText("No services match your filters")).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page.getByRole("article")).toHaveCount(11);
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
