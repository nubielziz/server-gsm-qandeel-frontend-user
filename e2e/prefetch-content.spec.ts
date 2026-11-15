// What a click shows before the server answers (performance plan P3.1, P3.2, P3.3, P3.4, P3.5). Each navigation test lets the
// page's prefetches finish, then HOLDS every later RSC request (the navigation's own) until its assertions are done:
// what is visible came from the prefetch. Held rather than aborted: a failed RSC request makes the router fall back to
// a document load, which would show the content and hide a missing prefetch. A document request is a failure too.
// Production build only (`E2E_BASE_URL=http://localhost:5176`): the dev server never prefetches (next/link docs,
// "Prefetching is only enabled in production"). `@next/playwright` `instant()` would do the holding, but it is a new
// dependency (not approved).
import type { Page, Request, Route } from "@playwright/test";
import { expect, test } from "./fixtures";
import { BASE_URL, signInCustomer, signInMerchant, stubTurnstile } from "./helpers";

test.skip(new URL(BASE_URL).port === "5175", "prefetching is only enabled in production: run against the production build");

/** An RSC request of the App Router (a prefetch or a navigation). */
function isRsc(request: Request): boolean {
  return request.headers()["rsc"] === "1" || new URL(request.url()).searchParams.has("_rsc");
}

/** Counts the RSC requests in flight, so a test can wait until the page's prefetches are done. */
function trackRsc(page: Page) {
  let inFlight = 0;
  let last = Date.now();
  page.on("request", (request) => {
    if (!isRsc(request)) return;
    inFlight += 1;
    last = Date.now();
  });
  const settle = (request: Request) => {
    if (!isRsc(request)) return;
    inFlight = Math.max(0, inFlight - 1);
    last = Date.now();
  };
  page.on("requestfinished", settle);
  page.on("requestfailed", settle);
  return {
    /** Resolves once no RSC request has been in flight for `quietMs`. */
    async idle(quietMs = 1500) {
      await expect
        .poll(() => inFlight === 0 && Date.now() - last >= quietMs, { message: "prefetches settle", timeout: 30_000, intervals: [250] })
        .toBe(true);
    },
  };
}

/** From now on, every RSC request waits until `release()` is called. */
async function holdRsc(page: Page): Promise<() => Promise<void>> {
  const held: Route[] = [];
  let holding = true;
  await page.route("**/*", async (route) => {
    if (holding && isRsc(route.request())) held.push(route);
    else await route.fallback();
  });
  return async () => {
    holding = false;
    await Promise.all(held.splice(0).map((route) => route.continue().catch(() => undefined)));
  };
}

/** The document loads of the main frame from now on (a soft navigation makes none). */
function documentLoads(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) urls.push(request.url());
  });
  return urls;
}

/** Skeletons the visitor can see in the page content (Next keeps the previous page in the DOM, hidden). */
const visibleSkeletons = (page: Page) => page.locator("main .skeleton:visible");

test.describe("content in the prefetch (P3.1, P3.2, P3.3)", () => {
  test("an All services link: the catalog's first page shows on the click", async ({ page, isMobile }) => {
    const rsc = trackRsc(page);
    await page.goto("/en");
    // The header pill (desktop) or the featured section's "View all" (phones: the pill is hidden below lg).
    const link = isMobile
      ? page.getByRole("region", { name: "Featured services" }).getByRole("link", { name: "View all" })
      : page.getByRole("banner").getByRole("link", { name: "All services", exact: true });
    await link.scrollIntoViewIfNeeded();
    await rsc.idle();

    const release = await holdRsc(page);
    const documents = documentLoads(page);
    await link.click();
    await expect(page).toHaveURL(/\/en\/services$/);
    await expect(page.getByRole("heading", { level: 1, name: "All services" })).toBeVisible();
    await expect(page.locator("main").getByRole("article").first()).toBeVisible();
    await expect(visibleSkeletons(page)).toHaveCount(0);
    expect(documents).toEqual([]);
    await release();
  });

  test("Buy now (guest): the checkout's summary and form show on the click", async ({ page }) => {
    await stubTurnstile(page);
    const rsc = trackRsc(page);
    await page.goto("/en/services/atandt-usa-premier-unlock");
    const buy = page.getByRole("link", { name: "Buy now" });
    await buy.scrollIntoViewIfNeeded();
    await rsc.idle();

    const release = await holdRsc(page);
    const documents = documentLoads(page);
    await buy.click();
    await expect(page).toHaveURL(/\/en\/checkout\?service=atandt-usa-premier-unlock$/);
    const main = page.locator("main");
    await expect(main.getByRole("heading", { level: 1, name: "Secure checkout" })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Order summary" })).toBeVisible();
    await expect(main.getByText("AT&T USA Premier Unlock").filter({ visible: true }).first()).toBeVisible();
    await expect(main.getByLabel("Email")).toBeVisible();
    await expect(visibleSkeletons(page)).toHaveCount(0);
    expect(documents).toEqual([]);
    await release();
  });

  test("Buy now (signed-in customer): the customer is never in the prefetch; the form follows the click", async ({ page }) => {
    await stubTurnstile(page);
    await signInCustomer(page);
    const rsc = trackRsc(page);
    await page.goto("/en/services/atandt-usa-premier-unlock");
    const buy = page.getByRole("link", { name: "Buy now" });
    await buy.scrollIntoViewIfNeeded();
    await rsc.idle();

    const release = await holdRsc(page);
    await buy.click();
    await expect(page).toHaveURL(/\/en\/checkout\?service=atandt-usa-premier-unlock$/);
    const main = page.locator("main");
    await expect(main.getByRole("heading", { level: 1, name: "Secure checkout" })).toBeVisible();
    // The customer read (`/store/v1/me`, no-store) holds the form back: its skeleton shows, no email field yet.
    await expect(visibleSkeletons(page).first()).toBeVisible();
    await expect(main.getByLabel("Email")).toHaveCount(0);

    await release();
    // The signed-in customer's email is locked in the form.
    await expect(main.getByLabel("Email")).toHaveAttribute("readonly", "");
    await expect(visibleSkeletons(page)).toHaveCount(0);
  });

  test("the first cards of the catalog: the service page shows on a tap; the price follows the click", async ({ page }) => {
    const rsc = trackRsc(page);
    await page.goto("/en/services");
    // The fourth card: the last one whose title link prefetches the page's content (PREFETCH_CARDS = 4).
    const card = page.locator("main").getByRole("article").nth(3);
    const title = (await card.getByRole("heading", { level: 3 }).innerText()).trim();
    await card.scrollIntoViewIfNeeded();
    await rsc.idle();

    const release = await holdRsc(page);
    const documents = documentLoads(page);
    await card.getByRole("heading", { level: 3 }).getByRole("link").click();
    await expect(page).toHaveURL(/\/en\/services\/[^/?#]+$/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    // The price waits for the navigation (`navigation()`): its pending block is all the page still shows as a skeleton.
    const order = page.getByRole("complementary", { name: "Your order" });
    await expect(order.getByRole("link", { name: "Buy now" }).or(order.getByRole("link", { name: /support/i })).first()).toBeVisible();
    expect(documents).toEqual([]);

    await release();
    await expect(order.locator(".skeleton:visible")).toHaveCount(0);
    await expect(order.getByText(/\$\d/).first()).toBeVisible();
  });

  test("the first card's quick view: the dialog opens named after the service on the tap; the price follows the click", async ({ page }) => {
    const rsc = trackRsc(page);
    await page.goto("/en/services");
    // The first card: its quick view link prefetches the dialog's title, body and actions (plan P3.3, PREFETCH_CARDS).
    const card = page.locator("main").getByRole("article").first();
    const title = (await card.getByRole("heading", { level: 3 }).innerText()).trim();
    const quickView = card.getByRole("link", { name: `Quick view: ${title}` });
    await quickView.scrollIntoViewIfNeeded();
    await rsc.idle();

    const release = await holdRsc(page);
    const documents = documentLoads(page);
    await quickView.click();
    await expect(page).toHaveURL(/\/en\/quick-view\/[^/?#]+$/);
    const dialog = page.getByRole("dialog", { name: title });
    await expect(dialog).toBeVisible();
    // The title came with the prefetch: its skeleton never shows.
    await expect(dialog.getByRole("heading", { level: 2 }).locator(".skeleton:visible")).toHaveCount(0);
    expect(documents).toEqual([]);

    await release();
    await expect(dialog.locator(".skeleton:visible")).toHaveCount(0);
    await expect(dialog.getByText(/\$\d/).first()).toBeVisible();
  });
});

test.describe("one filter form (P3.4)", () => {
  test("the catalog's HTML holds one filter form; the phone drawer mounts its own on first open", async ({ page, isMobile }) => {
    const html = await (await page.request.get("/en/services")).text();
    expect(html.match(/name="stock"/g) ?? [], "one 'In stock only' box in the server HTML").toHaveLength(1);
    // Without JavaScript the drawer cannot open: a <noscript> rule shows the sidebar at every width and hides its button.
    // (Only a rule check: without JavaScript React cannot reveal streamed content, and the list streams.)
    expect(html).toMatch(/<noscript><style>[^<]*\[data-list-filters-aside\]\{display:block\}[^<]*\[data-list-filters-trigger\]\{display:none\}[^<]*<\/style><\/noscript>/);
    expect(html).toMatch(/<aside[^>]*data-list-filters-aside=""/);

    await page.goto("/en/services");
    if (!isMobile) {
      await expect(page.getByRole("complementary", { name: "Filters" }).getByRole("group", { name: "Availability" })).toBeVisible();
      return;
    }
    const drawer = page.getByRole("dialog", { name: "Filters" });
    // Opened by the click handler: wait until the page is hydrated (the button has React props).
    const trigger = page.getByRole("button", { name: /^Filters/ });
    await expect
      .poll(() => trigger.evaluate((button) => Object.keys(button).some((key) => key.startsWith("__reactProps"))))
      .toBe(true);
    await trigger.click();
    await expect(drawer.getByRole("group", { name: "Availability" })).toBeVisible();
    await drawer.getByRole("button", { name: "Show results" }).click();
    await expect(drawer).toBeHidden();
  });
});

test.describe("soft language switch (P3.5)", () => {
  test("no document load; html lang and dir, the page and its hreflang alternates follow", async ({ page, isMobile }) => {
    test.skip(isMobile, "the header switcher sits in the menu drawer on a phone: the same component");
    await page.goto("/en/services/icloud-clean-lost-check");
    const switcher = page.locator('a[hreflang="ar"]:visible').first();
    // Until the page is hydrated the link is a plain fallback to /ar: wait for the real one before clicking.
    await expect(switcher).toHaveAttribute("href", /^\/ar\/services\//);

    const documents = documentLoads(page);
    await switcher.click();
    // The alternate's own slug, or the swapped one that redirects to it (metadataBase of another origin).
    await expect(page).toHaveURL(/\/ar\/services\/fahs-icloud$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("فحص حالة iCloud");
    const alternates = (hreflang: string) =>
      page.locator(`link[rel="alternate"][hreflang="${hreflang}"]`).evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    await expect.poll(() => alternates("en")).toEqual(expect.arrayContaining([expect.stringMatching(/\/en\/services\/icloud-clean-lost-check$/)]));
    expect((await alternates("en")).every((href) => /\/en\/services\/icloud-clean-lost-check$/.test(href))).toBe(true);
    expect((await alternates("ar")).every((href) => /\/ar\/services\/fahs-icloud$/.test(href))).toBe(true);
    await expect(page.locator('a[hreflang="en"]:visible').first()).toHaveAttribute("href", /^\/en\/services\//);
    expect(documents).toEqual([]);
    expect((await page.context().cookies()).find((cookie) => cookie.name === "gsm_locale")?.value).toBe("ar");
  });

  test("a signed-in customer and merchant: both saves are sent without holding the switch", async ({ page, isMobile }) => {
    test.skip(isMobile, "the header switcher sits in the menu drawer on a phone: the same component");
    const storeCsrf = await signInCustomer(page);
    const clientCsrf = await signInMerchant(page);
    await page.goto("/en/services");
    const switcher = page.locator('a[hreflang="ar"]:visible').first();
    await expect(switcher).toHaveAttribute("href", "/ar/services");

    // Held saves must not hold the switch (they are not awaited).
    const saves: Route[] = [];
    await page.route(/\/(store\/v1\/me|client\/profile)$/, async (route) => {
      if (route.request().method() === "PATCH") saves.push(route);
      else await route.fallback();
    });
    const documents = documentLoads(page);
    const customerSave = page.waitForRequest((r) => r.url().endsWith("/store/v1/me") && r.method() === "PATCH");
    const merchantSave = page.waitForRequest((r) => r.url().endsWith("/client/profile") && r.method() === "PATCH");
    await switcher.click();
    await expect(page).toHaveURL(/\/ar\/services$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("جميع الخدمات");
    expect((await customerSave).postDataJSON()).toEqual({ locale: "ar" });
    expect((await merchantSave).postDataJSON()).toEqual({ locale: "ar" });
    expect(documents).toEqual([]);

    await Promise.all(saves.map((route) => route.continue()));
    await expect(async () => {
      const [merchant, customer] = await Promise.all([page.request.get("/client/auth/me"), page.request.get("/store/v1/me")]);
      expect((await merchant.json()).locale).toBe("ar");
      expect((await customer.json()).locale).toBe("ar");
    }).toPass();

    // The demo accounts go back to English for the other specs.
    const origin = new URL(BASE_URL).origin;
    const back = await Promise.all([
      page.request.patch("/store/v1/me", { headers: { Origin: origin, "X-CSRF-Token": storeCsrf }, data: { locale: "en" } }),
      page.request.patch("/client/profile", { headers: { Origin: origin, "X-CSRF-Token": clientCsrf }, data: { locale: "en" } }),
    ]);
    for (const res of back) expect(res.ok(), await res.text()).toBe(true);
  });

  test("English pages never download the Arabic web font for the switcher's label", async ({ page }) => {
    const fonts: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "font") fonts.push(request.url());
    });
    await page.goto("/en/services");
    await page.waitForLoadState("networkidle");
    // next/font names the files by hash: the Arabic one is the only font besides Inter, so English pages load one file.
    expect(new Set(fonts).size, fonts.join("\n")).toBeLessThanOrEqual(1);
  });
});
