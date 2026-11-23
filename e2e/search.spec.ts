// Product search (feature 29, backend plan §7, §8): the English header combobox and the results page, against the
// isolated demo API (:3100) with search on (scripts/dev-backend.sh sets SEARCH_ENABLED and its own Typesense prefix).
// The demo catalog has 11 English services (Samsung: "Samsung Info (KG / FRP / Region)" and "Samsung KG Lock Fix"; iCloud,
// Verizon, Vodafone, AT&T …), so the phrases below are the ones its titles, brands and synonyms make.
// Nothing here changes data. The combobox loads lazily on the first interaction: the field is a plain search box before.
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { go } from "./helpers";

const SUGGEST = "/store/v1/search/suggest";
const LABEL = "Search services";

/** The header's search combobox: the desktop bar's copy, or the phone row's (opened here). */
async function headerSearch(page: Page, isMobile: boolean): Promise<Locator> {
  if (isMobile) {
    await page.getByRole("banner").getByRole("button", { name: "Open search" }).click();
  }
  const box = page.getByRole("banner").getByRole("combobox", { name: LABEL });
  await expect(box).toBeVisible();
  return box;
}

/** The open list of the combobox. */
const listbox = (page: Page) => page.getByRole("listbox", { name: LABEL });

/** Types into the box (as keystrokes, so the debounce and the aborts run) and waits for the list. */
async function typeQuery(page: Page, box: Locator, text: string) {
  await box.click();
  await box.pressSequentially(text, { delay: 40 });
  await expect(listbox(page)).toBeVisible();
  // The answer for the whole text may land after the list first shows (an earlier answer for a part of it opened it); a new
  // answer resets the active option, so the tests wait until the requests are done before pressing keys.
  await page.waitForLoadState("networkidle");
}

test.describe("header combobox", () => {
  test("typing sams shows the completion samsung and the Samsung services, with price and the tax note", async ({ page, isMobile }) => {
    await go(page, "/en");
    const box = await headerSearch(page, isMobile);
    await typeQuery(page, box, "sams");
    const list = listbox(page);
    await expect(list.getByRole("group", { name: "Suggestions" }).getByRole("option").filter({ hasText: /^samsung$/ })).toHaveCount(1);
    const services = list.getByRole("group", { name: "Services" }).getByRole("option");
    await expect(services.first()).toContainText("Samsung");
    await expect(services.filter({ hasText: "Samsung KG Lock Fix" })).toHaveCount(1);
    await expect(services.first()).toContainText("$");
    await expect(page.getByText("Prices before tax")).toBeVisible();
    // ARIA 1.2: expanded, controls the listbox, and no option active until the arrows move.
    await expect(box).toHaveAttribute("aria-expanded", "true");
    await expect(box).toHaveAttribute("aria-controls", (await list.getAttribute("id")) ?? "");
    await expect(box).not.toHaveAttribute("aria-activedescendant", /.+/);
    await expect(list.getByRole("option", { selected: true })).toHaveCount(0);
  });

  test("the ghost completes the phrase and Tab accepts it", async ({ page, isMobile }) => {
    test.skip(isMobile, "no Tab key on a phone: the ghost is not drawn there");
    await go(page, "/en");
    const box = await headerSearch(page, false);
    await typeQuery(page, box, "samsung k");
    const ghost = page.locator("[data-search-ghost]");
    await expect(ghost).toBeVisible();
    // The ghost's whole phrase is the first suggestion (what a screen reader hears).
    const first = listbox(page).getByRole("group", { name: "Suggestions" }).getByRole("option").first();
    const phrase = (await first.innerText()).trim();
    expect(phrase.startsWith("samsung k") && phrase.length > "samsung k".length, phrase).toBe(true);
    await box.press("Tab");
    await expect(box).toHaveValue(phrase);
    await expect(box).toBeFocused();
  });

  test("icl shows the ghost oud; Right arrow at the end accepts it", async ({ page, isMobile }) => {
    test.skip(isMobile, "no ghost on coarse pointers");
    await go(page, "/en");
    const box = await headerSearch(page, false);
    await typeQuery(page, box, "icl");
    await expect(page.locator("[data-search-ghost]")).toHaveText(/icl\s*oud$/);
    await box.press("ArrowRight");
    await expect(box).toHaveValue("icloud");
  });

  test("Down moves to a service and Enter opens it", async ({ page, isMobile }) => {
    await go(page, "/en");
    const box = await headerSearch(page, isMobile);
    await typeQuery(page, box, "samsung");
    const list = listbox(page);
    const service = list.getByRole("group", { name: "Services" }).getByRole("option").first();
    await expect(service).toBeVisible();
    const options = list.getByRole("option");
    const ids = await options.evaluateAll((elements) => elements.map((element) => element.id));
    const target = await service.getAttribute("id");
    const href = await service.getAttribute("href");
    expect(href).toMatch(/^\/en\/services\/[^/?#]+$/);
    for (let i = 0; i <= ids.indexOf(target ?? ""); i++) await box.press("ArrowDown");
    await expect(box).toHaveAttribute("aria-activedescendant", target ?? "");
    await expect(service).toHaveAttribute("aria-selected", "true");
    await box.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test("Enter on typed text opens the results page; Escape closes the list, then clears the text", async ({ page, isMobile }) => {
    await go(page, "/en");
    const box = await headerSearch(page, isMobile);
    await typeQuery(page, box, "unlo");
    await box.press("Escape");
    await expect(listbox(page)).toBeHidden();
    await expect(box).toHaveValue("unlo");
    await box.press("Escape");
    await expect(box).toHaveValue("");

    await box.pressSequentially("unlock", { delay: 30 });
    await box.press("Enter");
    await expect(page).toHaveURL(/\/en\/services\?q=unlock$/);
    await expect(page.getByRole("heading", { level: 1, name: "All services" })).toBeVisible();
    await expect(page.locator("main").getByRole("article").first()).toBeVisible();
  });

  test("a typo still finds the service, in the box and on the results page", async ({ page, isMobile }) => {
    await go(page, "/en");
    const box = await headerSearch(page, isMobile);
    await typeQuery(page, box, "iclod");
    await expect(listbox(page).getByRole("group", { name: "Services" }).getByRole("option").first()).toContainText("iCloud");
    await page.goto("/en/services?q=iclod");
    await expect(page.locator("main").getByRole("article").filter({ hasText: "iCloud Clean / Lost Check" })).toHaveCount(1);
  });

  test("a query with a single exact hit still shows nearby services", async ({ page, isMobile }) => {
    await go(page, "/en");
    const box = await headerSearch(page, isMobile);
    await typeQuery(page, box, "iphone unlock verizon");
    const services = listbox(page).getByRole("group", { name: "Services" }).getByRole("option");
    await expect(services.first()).toContainText("Verizon iPhone Unlock");
    await expect(async () => expect(await services.count()).toBeGreaterThan(1)).toPass();
  });

  test("an empty box offers recent searches (kept in this browser) and Clear recent searches", async ({ page, isMobile }) => {
    await go(page, "/en");
    let box = await headerSearch(page, isMobile);
    // The list shows first: the box is awake, so its submit handler keeps the search (a submit before the lazy chunk loads
    // still searches, without a recent entry).
    await typeQuery(page, box, "icloud");
    await box.press("Enter");
    await expect(page).toHaveURL(/\/en\/services\?q=icloud$/);
    await go(page, "/en");
    box = await headerSearch(page, isMobile);
    await box.click();
    const recent = listbox(page).getByRole("group", { name: "Recent searches" });
    await expect(recent.getByRole("option", { name: "icloud", exact: true })).toBeVisible();
    await recent.getByRole("option", { name: "Clear recent searches" }).click();
    await expect(page.getByRole("group", { name: "Recent searches" })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("gsm.search.recent"))).toBeNull();
  });

  test("phone: the fill arrow puts a completion in the box without leaving the page", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the fill arrows show on coarse pointers");
    await go(page, "/en");
    const box = await headerSearch(page, true);
    await typeQuery(page, box, "sams");
    const fill = listbox(page).locator('[title^="Fill in "]').first();
    const phrase = ((await fill.getAttribute("title")) ?? "").replace(/^Fill in /, "");
    expect(phrase).toMatch(/^sams/);
    await fill.tap();
    await expect(box).toHaveValue(`${phrase} `);
    await expect(page).toHaveURL(/\/en$/);
    await expect(box).toBeFocused();
  });

  test("phone: the search row stays open (its button says Close search) while the list shows and hides", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the search row is the phone header's");
    await go(page, "/en");
    const box = await headerSearch(page, true);
    const button = (name: string) => page.getByRole("banner").getByRole("button", { name, exact: true });
    await expect(button("Close search")).toBeVisible();
    await typeQuery(page, box, "sams");
    // The list's own popover hides when nothing is suggested: the row and its button must not follow it.
    const answered = page.waitForResponse((response) => response.url().includes(SUGGEST) && /[?&]q=zzzzzzz(&|$)/.test(response.url()));
    await box.fill("");
    await box.pressSequentially("zzzzzzz", { delay: 40 });
    await answered;
    await expect(listbox(page)).toBeHidden();
    await expect(button("Close search")).toBeVisible();
    await expect(box).toBeVisible();
    await expect(box).toBeFocused();
    await button("Close search").tap();
    await expect(box).toBeHidden();
    await expect(button("Open search")).toBeVisible();
  });
});

test.describe("loading and markup", () => {
  test("no suggest request and no combobox before the first interaction; its chunk loads on interaction", async ({ page, isMobile }) => {
    const suggests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes(SUGGEST)) suggests.push(request.url());
    });
    await go(page, "/en");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1_000);
    expect(suggests, "no request before an interaction").toEqual([]);
    await expect(page.getByRole("listbox", { name: LABEL })).toHaveCount(0);

    const scripts: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "script") scripts.push(request.url());
    });
    const box = await headerSearch(page, isMobile);
    await box.click();
    await expect.poll(() => scripts.length, { message: "the combobox chunk loads on the first interaction" }).toBeGreaterThan(0);
    await box.pressSequentially("vod", { delay: 30 });
    await expect.poll(() => suggests.some((url) => /[?&]q=vod(&|$)/.test(url))).toBe(true);
  });

  test("text typed while the chunk loads is kept and asked at once", async ({ page, isMobile }) => {
    await go(page, "/en");
    // Every script requested from now on (the lazy chunk) arrives 1.5 s late.
    await page.route("**/_next/static/chunks/**", async (route) => {
      if (route.request().resourceType() === "script") await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });
    if (isMobile) await page.getByRole("banner").getByRole("button", { name: "Open search" }).click();
    const field = page.getByRole("banner").locator("form[role=search] input[type=search]:visible");
    await field.click();
    await field.pressSequentially("vodaf", { delay: 20 });
    await expect(field).toHaveValue("vodaf");
    const box = page.getByRole("banner").getByRole("combobox", { name: LABEL });
    await expect(listbox(page)).toBeVisible({ timeout: 20_000 });
    await expect(box).toHaveValue("vodaf");
    await expect(listbox(page).getByRole("option").first()).toBeVisible();
  });

  test("no duplicate id in the document while both header copies are mounted", async ({ page, isMobile }) => {
    await go(page, "/en");
    const box = await headerSearch(page, isMobile);
    await typeQuery(page, box, "sams");
    const fields = page.getByRole("banner").locator("[data-search-enhance] input");
    await expect(fields).toHaveCount(2);
    const fieldIds = await fields.evaluateAll((inputs) => inputs.map((input) => input.id));
    expect(fieldIds.every(Boolean)).toBe(true);
    expect(new Set(fieldIds).size).toBe(2);
    const duplicates = await page.evaluate(() => {
      const seen = new Map<string, number>();
      for (const element of document.querySelectorAll("[id]")) seen.set(element.id, (seen.get(element.id) ?? 0) + 1);
      return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
    });
    expect(duplicates).toEqual([]);
  });

  test("axe finds no WCAG A/AA violation in the open combobox", async ({ page, isMobile }) => {
    await go(page, "/en");
    const box = await headerSearch(page, isMobile);
    await typeQuery(page, box, "sams");
    await expect(listbox(page).getByRole("option").first()).toBeVisible();
    // axe-core ships with the lint setup (eslint-plugin-jsx-a11y); no extra dependency.
    await page.addScriptTag({ path: join(__dirname, "..", "node_modules", "axe-core", "axe.min.js") });
    await box.evaluate((input) => input.closest("[data-search-enhance]")?.parentElement?.parentElement?.setAttribute("data-axe-scope", ""));
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string; nodes: { target: unknown }[] }[] }> } }).axe;
      const result = await axe.run("[data-axe-scope]", { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
      return result.violations.map((violation) => `${violation.id}: ${JSON.stringify(violation.nodes.map((node) => node.target))}`);
    });
    expect(violations).toEqual([]);
  });
});

test.describe("results page", () => {
  test("samsng frp says Did you mean samsung frp?, and the link searches it", async ({ page }) => {
    await page.goto("/en/services?q=samsng+frp");
    const main = page.locator("main");
    await expect(main.getByText(/Did you mean/)).toBeVisible();
    const link = main.getByRole("link", { name: "samsung frp", exact: true });
    await expect(link).toHaveAttribute("href", "/en/services?q=samsung+frp");
    await expect(main.getByRole("article").filter({ hasText: "Samsung Info (KG / FRP / Region)" })).toHaveCount(1);
  });

  test("Best match is the default sort of a search, Featured is not offered; the page is noindex", async ({ page }) => {
    await page.goto("/en/services?q=unlock");
    const sort = page.getByLabel("Sort by");
    await expect(sort).toHaveValue("relevance");
    await expect(sort.locator("option").first()).toHaveText("Best match");
    await expect(sort.locator("option", { hasText: "Featured" })).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    // The plain catalog keeps Featured and stays indexable.
    await page.goto("/en/services");
    await expect(page.getByLabel("Sort by")).toHaveValue("featured");
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  });

  test("facet counts come from the search route: the sidebar's brand numbers are its facet counts", async ({ page, request, isMobile }) => {
    const res = await request.get("/store/v1/search?q=unlock&currency=USD");
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { engine: string; facets: { brand: { value: string; count: number }[] } | null };
    expect(body.engine).toBe("typesense");
    const brands = body.facets?.brand ?? [];
    expect(brands.length).toBeGreaterThan(0);

    await page.goto("/en/services?q=unlock");
    if (isMobile) await page.getByRole("button", { name: /^Filters/ }).click();
    const filters = isMobile ? page.getByRole("dialog", { name: "Filters" }) : page.getByRole("complementary", { name: "Filters" });
    const group = filters.getByRole("group", { name: "Brand" });
    for (const brand of brands.slice(0, 6)) {
      await expect(group.getByRole("checkbox", { name: new RegExp(`^${brand.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(${brand.count}\\)`) })).toBeVisible();
    }
  });

  test("an IMEI search offers no IMEI check (the free check is gone)", async ({ page }) => {
    await page.goto("/en/services?q=356938035643809");
    await expect(page.locator("main").getByRole("link", { name: /Check IMEI/ })).toHaveCount(0);
  });

  test("nothing found: the empty state names the search and offers Clear filters", async ({ page }) => {
    await page.goto("/en/services?q=zzzzzzz");
    await expect(page.getByText("No services match “zzzzzzz”")).toBeVisible();
    await expect(page.getByText(/Did you mean/)).toHaveCount(0);
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/en\/services$/);
  });

  test("301 results-page searches in a minute from distinct addresses never hit the rate limit", async ({ request }) => {
    test.setTimeout(240_000);
    // The site forwards each visitor's address (apiVisitorGet), so 301 visitors are 301 budgets, not one shared one.
    const statuses: number[] = [];
    const broken: number[] = [];
    const started = Date.now();
    for (let batch = 0; batch < 301; batch += 10) {
      const results = await Promise.all(
        Array.from({ length: Math.min(10, 301 - batch) }, async (_, i) => {
          const n = batch + i;
          const res = await request.get(`/en/services?q=unlock`, { headers: { "X-Forwarded-For": `10.29.${n >> 8}.${(n & 255) || 1}` } });
          const html = await res.text();
          return { n, status: res.status(), ok: html.includes("<article") };
        }),
      );
      for (const result of results) {
        statuses.push(result.status);
        if (!result.ok) broken.push(result.n);
      }
    }
    expect(statuses.filter((status) => status !== 200)).toEqual([]);
    expect(broken, "every page rendered its cards (no 429 behind the page)").toEqual([]);
    test.info().annotations.push({ type: "duration", description: `${Date.now() - started} ms for 301 searches` });
  });
});
