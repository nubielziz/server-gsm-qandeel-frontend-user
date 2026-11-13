// Catalog list (plan F12): the API filters, sorts and pages the rows of `/services` and of the home page's "All services";
// real categories with their service count, "In stock only" and six sorts live in the URL.
// Real browser → Next → the isolated demo backend (:3100). The tests read the same API through the site's own rewrite
// (`/store/v1/*`) and compare, so they follow the demo data instead of repeating it.
import { type APIRequestContext, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { fixtures } from "./helpers";

type ApiCategory = { id: number; slug: string; name: string; serviceCount: number };
type ApiService = { slug: string; title: string; price: { gross: string } };

/** The categories the API lists, in one language. */
async function apiCategories(request: APIRequestContext, locale: "en" | "ar" = "en"): Promise<ApiCategory[]> {
  const res = await request.get(`/store/v1/categories?locale=${locale}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { categories: ApiCategory[] }).categories;
}

/** One page of the API's service list in English and USD (what the site shows a visitor with no currency cookie). */
async function apiServices(request: APIRequestContext, query: string): Promise<{ rows: ApiService[]; total: number }> {
  const res = await request.get(`/store/v1/services?locale=en&currency=USD&${query}`);
  expect(res.status(), await res.text()).toBe(200);
  return { rows: (await res.json()) as ApiService[], total: Number(res.headers()["x-total-count"]) };
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The accessible name of a category's checkbox: its name, then its `serviceCount` in brackets. */
const categoryCheckbox = (category: ApiCategory) => new RegExp(`^${escapeRegExp(category.name)}\\s*\\(${category.serviceCount}\\)`);

const servicesText = (n: number) => (n === 1 ? "1 service" : `${n} services`);

/** The filter sidebar on a desktop; on a phone the drawer, opened here. */
async function openFilters(page: Page, isMobile: boolean, name = "Filters") {
  if (isMobile) await page.getByRole("button", { name: new RegExp(`^${escapeRegExp(name)}`) }).click();
  return isMobile ? page.getByRole("dialog", { name }) : page.getByRole("complementary", { name });
}

/** The titles of the cards on the page, in order. */
const cardTitles = (page: Page) => page.getByRole("article").getByRole("heading", { level: 3 }).allInnerTexts();

/** The slugs of the cards on the page, in order (the title link of each card). */
async function cardSlugs(page: Page): Promise<string[]> {
  const hrefs = await page.getByRole("article").locator("h3 a").evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  return hrefs.map((href) => decodeURIComponent(href.split("/").pop() ?? ""));
}

/** The shown price of each card, in order (USD, no tax). */
const cardPrices = (page: Page) =>
  page.getByRole("article").evaluateAll((cards) => cards.map((card) => Number(/\$(\d+(?:\.\d+)?)/.exec(card.textContent ?? "")?.[1])));

/** A small category (it fits one page of 24) with a service or two in it, from the API. */
async function pickCategories(request: APIRequestContext, count: number): Promise<ApiCategory[]> {
  const picked = (await apiCategories(request)).filter((category) => category.serviceCount > 0 && category.serviceCount <= 24);
  expect(picked.length, `the demo catalog has ${count} categories with services`).toBeGreaterThanOrEqual(count);
  return picked.slice(0, count);
}

test.describe("categories", () => {
  test("a category link lists exactly its service count and shows its chip", async ({ page, request, isMobile }) => {
    const [category] = await pickCategories(request, 1);
    await page.goto(`/en/services?category=${category.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: "All services" })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(category.serviceCount);
    await expect(page.getByText(servicesText(category.serviceCount), { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: `Remove filter: ${category.name}` })).toBeVisible();

    // The same total the API gives for the category, and the box is ticked in the sidebar.
    expect((await apiServices(request, `categoryId=${category.id}&_start=0&_end=1`)).total).toBe(category.serviceCount);
    const filters = await openFilters(page, isMobile);
    await expect(filters.getByRole("group", { name: "Categories" }).getByRole("checkbox", { name: categoryCheckbox(category) })).toBeChecked();
  });

  test("two categories add up", async ({ page, request }) => {
    const [first, second] = await pickCategories(request, 2);
    const sum = first.serviceCount + second.serviceCount;
    await page.goto(`/en/services?category=${first.slug}&category=${second.slug}`);
    await expect(page.getByRole("article")).toHaveCount(Math.min(sum, 24));
    await expect(page.getByText(servicesText(sum), { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: `Remove filter: ${first.name}` })).toBeVisible();
    await expect(page.getByRole("link", { name: `Remove filter: ${second.name}` })).toBeVisible();
    // A chip removes one category and keeps the other.
    await page.getByRole("link", { name: `Remove filter: ${first.name}` }).click();
    await expect(page).toHaveURL(new RegExp(`/en/services\\?category=${escapeRegExp(second.slug)}$`));
    await expect(page.getByRole("article")).toHaveCount(second.serviceCount);
  });

  test("ticking a category in the sidebar applies at once; its chip removes it", async ({ page, request, isMobile }) => {
    const [category] = await pickCategories(request, 1);
    await page.goto("/en/services");
    const filters = await openFilters(page, isMobile);
    await filters.getByRole("group", { name: "Categories" }).getByRole("checkbox", { name: categoryCheckbox(category) }).check();
    await expect(page).toHaveURL(new RegExp(`/en/services\\?category=${escapeRegExp(category.slug)}$`));
    if (isMobile) await filters.getByRole("button", { name: "Show results" }).click();
    await expect(page.getByRole("article")).toHaveCount(category.serviceCount);
    await page.getByRole("link", { name: `Remove filter: ${category.name}` }).click();
    await expect(page).toHaveURL(/\/en\/services$/);
    await expect(page.getByRole("link", { name: /^Remove filter/ })).toHaveCount(0);
  });

  test("a category the API does not list is ignored and shown as a chip that removes it", async ({ page, request }) => {
    const all = await apiServices(request, "_start=0&_end=1");
    await page.goto("/en/services?category=999-gone-fishing");
    await expect(page.getByRole("heading", { level: 1, name: "All services" })).toBeVisible();
    // Not applied: the whole catalog is listed (no empty state, no error), and the visitor can still remove the link's filter.
    await expect(page.getByRole("article")).toHaveCount(Math.min(all.total, 24));
    const chip = page.getByRole("link", { name: "Remove filter: gone fishing" });
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(page).toHaveURL(/\/en\/services$/);
    await expect(chip).toHaveCount(0);
  });

  test("search, sort and filters keep each other in the URL", async ({ page, request }) => {
    const [category] = await pickCategories(request, 1);
    await page.goto(`/en/services?category=${category.slug}&sort=price_desc`);
    const search = page.getByRole("searchbox", { name: "Search", exact: true });
    await search.fill("a");
    await search.press("Enter");
    await expect(page).toHaveURL(/q=a/);
    const params = new URL(page.url()).searchParams;
    expect(params.getAll("category")).toEqual([category.slug]);
    expect(params.get("sort")).toBe("price_desc");
    expect(params.get("q")).toBe("a");
    await expect(page.getByLabel("Sort by")).toHaveValue("price_desc");
  });
});

test.describe("availability", () => {
  test("In stock only lists the stocked fixture and only in-stock services; its number is the list total", async ({ page, request, isMobile }) => {
    const { slug } = fixtures().stocked;
    // The site caches catalog reads for about 30 s, so a stock change made by the global setup may still be on its way.
    await expect(async () => {
      await page.goto("/en/services?stock=1");
      const api = await apiServices(request, "availability=in_stock&_start=0&_end=100");
      expect(api.rows.map((row) => row.slug)).toContain(slug);
      // The streamed list is revealed just after the load event: wait for it before reading the cards.
      await expect(page.getByRole("article")).toHaveCount(Math.min(api.total, 24));
      const listed = await cardSlugs(page);
      expect(listed).toContain(slug);
      // Every listed service reads `in_stock` on the API, and nothing is missing from the first page.
      expect(listed.every((listedSlug) => api.rows.some((row) => row.slug === listedSlug))).toBe(true);
      expect(listed).toHaveLength(Math.min(api.total, 24));
      await expect(page.getByText(servicesText(api.total), { exact: true }).first()).toBeVisible();

      // "In stock only (N)": N is the list's total (a number of services, never of codes), and the box is ticked.
      const filters = await openFilters(page, isMobile);
      const box = filters.getByRole("group", { name: "Availability" }).getByRole("checkbox", { name: new RegExp(`^In stock only\\s*\\(${api.total}\\)`) });
      await expect(box).toBeChecked();
    }).toPass({ timeout: 90_000, intervals: [5_000] });
    await expect(page.getByRole("link", { name: "Remove filter: In stock only" })).toBeVisible();
  });

  test("ticking In stock only applies at once and its chip removes it", async ({ page, isMobile }) => {
    await page.goto("/en/services");
    const filters = await openFilters(page, isMobile);
    const box = filters.getByRole("group", { name: "Availability" }).getByRole("checkbox", { name: /^In stock only/ });
    await box.check();
    await expect(page).toHaveURL(/\/en\/services\?stock=1$/);
    if (isMobile) await filters.getByRole("button", { name: "Show results" }).click();
    await page.getByRole("link", { name: "Remove filter: In stock only" }).click();
    await expect(page).toHaveURL(/\/en\/services$/);
  });

  test("no stock number, pre-order or sold-out wording appears on the list", async ({ page }) => {
    for (const url of ["/en/services", "/en/services?stock=1", "/en", "/en?stock=1"]) {
      await page.goto(url);
      await expect(page.getByRole("article").first()).toBeVisible();
      const text = await page.locator("body").innerText();
      expect(text, url).not.toMatch(/out of stock|sold out|pre-?order/i);
      // "5 left", "3 remaining", "12 units in stock", "stock: 4" and the like. ("In stock only (1)" counts services and is fine.)
      expect(text, url).not.toMatch(/\b\d+\s*(left|remaining|units?\b|pieces?\b|codes?\b)/i);
      expect(text, url).not.toMatch(/\b(stock|available|inventory)\s*[:=]\s*\d/i);
    }
  });
});

test.describe("sorts", () => {
  for (const [sort, order] of [
    ["price_asc", "asc"],
    ["price_desc", "desc"],
  ] as const) {
    test(`?sort=${sort} orders the card prices ${order === "asc" ? "low to high" : "high to low"}, as the API does`, async ({ page, request }) => {
      const api = await apiServices(request, `_sort=price&_order=${order}&_start=0&_end=24`);
      await page.goto(`/en/services?sort=${sort}`);
      await expect(page.getByLabel("Sort by")).toHaveValue(sort);
      // The same order as the API's own (ties by its own rule); auto-waits for the streamed list.
      await expect(page.getByRole("article").getByRole("heading", { level: 3 })).toHaveText(api.rows.map((row) => row.title));
      const prices = await cardPrices(page);
      expect(prices.length).toBeGreaterThan(1);
      expect(prices.every(Number.isFinite)).toBe(true);
      expect(prices).toEqual([...prices].sort(order === "asc" ? (a, b) => a - b : (a, b) => b - a));
    });
  }

  for (const [sort, apiSort] of [
    ["popular", "popular"],
    ["newest", "listedAt"],
  ] as const) {
    test(`?sort=${sort} lists the services the API sorts by ${apiSort}, with no error state`, async ({ page, request }) => {
      // The site caches catalog reads for up to 30 s (D14) and other specs place orders, which can move the best sellers:
      // read the page and the API again until they agree.
      await expect(async () => {
        await page.goto(`/en/services?sort=${sort}`);
        await expect(page.getByRole("heading", { level: 1, name: "All services" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
        await expect(page.getByText("No services match your filters")).toHaveCount(0);
        // The request the server made was accepted: the page holds the API's own order.
        const api = await apiServices(request, `_sort=${apiSort}&_order=desc&_start=0&_end=24`);
        expect(api.rows.length).toBeGreaterThan(0);
        await expect(page.getByRole("article")).toHaveCount(api.rows.length);
        expect(await cardTitles(page)).toEqual(api.rows.map((row) => row.title));
        await expect(page.getByLabel("Sort by")).toHaveValue(sort);
      }).toPass({ timeout: 90_000, intervals: [5_000] });
    });
  }

  test("an unknown sort is the default; the select offers the six sorts and a choice goes into the URL", async ({ page }) => {
    await page.goto("/en/services?sort=bogus");
    const select = page.getByLabel("Sort by");
    await expect(select).toHaveValue("featured");
    await expect(select.locator("option")).toHaveText([
      "Featured",
      "Best sellers",
      "New arrivals",
      "Price: low to high",
      "Price: high to low",
      "Name (A to Z)",
    ]);
    await select.selectOption({ label: "Best sellers" });
    await expect(page).toHaveURL(/\/en\/services\?sort=popular$/);
    await select.selectOption({ label: "Featured" });
    await expect(page).toHaveURL(/\/en\/services$/);
  });
});

test.describe("price range, paging and crafted links", () => {
  test("?max=14 still lists 6 services, as the API does", async ({ page, request }) => {
    await page.goto("/en/services?max=14");
    await expect(page.getByRole("article")).toHaveCount(6);
    await expect(page.getByRole("link", { name: "Remove filter: Price: $3 to $14" })).toBeVisible();
    expect((await apiServices(request, "maxPrice=14&_start=0&_end=1")).total).toBe(6);
  });

  test("a reversed price range is turned round: no error, the same list", async ({ page }) => {
    await page.goto("/en/services?min=20&max=10");
    await expect(page.getByRole("heading", { level: 1, name: "All services" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
    await expect(page.getByRole("article").first()).toBeVisible();
    const turned = await cardTitles(page);
    expect(turned.length).toBeGreaterThan(0);
    await page.goto("/en/services?min=10&max=20");
    await expect(page.getByRole("article").getByRole("heading", { level: 3 })).toHaveText(turned);
  });

  test("a page past the end shows the last page; absurd page numbers do not break the list", async ({ page, request }) => {
    const { total } = await apiServices(request, "_start=0&_end=1");
    const last = Math.ceil(total / 8);
    await page.goto("/en?page=99#all-services");
    const list = page.getByRole("region", { name: /^All services/ });
    await expect(list.getByRole("article")).toHaveCount(total - (last - 1) * 8);
    for (const page_ of ["99999999999999999999", "-3", "abc", "1.5e3"]) {
      await page.goto(`/en/services?page=${page_}`);
      await expect(page.getByRole("heading", { level: 1, name: "All services" })).toBeVisible();
      await expect(page.getByRole("article").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
    }
  });

  test("a crafted link (a NUL byte, huge or malformed bounds, unknown values) never breaks the page", async ({ page }) => {
    for (const query of ["q=%00", "brand=%00x&network=%00", "min=abc&max=99999999999999999999", "stock=maybe&type=bogus&country=%00", "category=%00"]) {
      await page.goto(`/en/services?${query}`);
      await expect(page.getByRole("heading", { level: 1, name: "All services" }), query).toBeVisible();
      await expect(page.getByRole("button", { name: "Try again" }), query).toHaveCount(0);
    }
  });
});

test.describe("Arabic", () => {
  test("category names and counts come from the API and the page is right-to-left", async ({ page, request, isMobile }) => {
    const categories = (await apiCategories(request, "ar")).filter((category) => category.serviceCount > 0);
    expect(categories.length).toBeGreaterThan(0);
    await page.goto("/ar/services");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("جميع الخدمات");
    const filters = await openFilters(page, isMobile, "التصفية");
    const group = filters.getByRole("group", { name: "الفئات" });
    for (const category of categories) {
      await expect(group.getByRole("checkbox", { name: new RegExp(`^${escapeRegExp(category.name)}`) })).toBeVisible();
    }
    await expect(filters.getByRole("group", { name: "نوع الخدمة" })).toBeVisible();
    if (isMobile) await filters.getByRole("button", { name: "عرض النتائج" }).click();

    // A category lists its Arabic services; the chip speaks Arabic around the API's name.
    const [category] = categories;
    await page.goto(`/ar/services?category=${category.slug}`);
    await expect(page.getByRole("article")).toHaveCount(category.serviceCount);
    await expect(page.getByRole("link", { name: `إزالة عامل التصفية: ${category.name}` })).toBeVisible();
    // The sorts are named in Arabic.
    expect(await page.getByLabel("الترتيب").locator("option").allInnerTexts()).toEqual(expect.arrayContaining(["الأكثر مبيعًا", "وصل حديثًا"]));
  });

  test("a category that exists only in English is ignored on the Arabic page", async ({ page, request }) => {
    const [english, arabic] = await Promise.all([apiCategories(request, "en"), apiCategories(request, "ar")]);
    const englishOnly = english.find((category) => !arabic.some((other) => other.id === category.id));
    test.skip(!englishOnly, "every English category also has Arabic services in the demo catalog");
    await page.goto(`/ar/services?category=${englishOnly!.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("جميع الخدمات");
    // Not applied (the link may come from the English page's language switch): the Arabic catalog is listed, not an empty state.
    await expect(page.getByRole("article").first()).toBeVisible();
    await expect(page.getByText("لا توجد خدمات مطابقة")).toHaveCount(0);
  });
});
