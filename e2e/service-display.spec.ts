// How the shop shows a service (BH §2.1, §2.4, §14.3 to §14.5): delivery in the page's language, the "In stock" mark and
// never "Pre-order" or "Out of stock" or a stock number, "per unit" and "From" for packs, a range and an exact N (page and
// quick view), the language switch through `alternates`, service pictures through next/image and JOD with two decimals.
// Real browser → Next → the isolated demo backend (:3100). The services are the fixtures of the global setup
// (e2e/global-setup.ts → e2e/.auth/fixtures.json): range = 2 to 50, packs = 5/10/25, exact = 5, stocked = in stock,
// pictured = has a picture. Nothing here changes data. A catalog value the setup may have just changed is read through
// `toPass` with a reload, because the site caches catalog reads for about 30 s (F03 rules).
import { type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { fixtures } from "./helpers";

interface ApiService {
  id: number;
  slug: string;
  title: string;
  availability: "in_stock" | "on_request";
  deliveryMinutes: number;
  etaText: string;
  imageUrl: string | null;
  price: { gross: string; currency: string };
  quantity: { min: number; max: number; options: number[] };
  alternates: { locale: "en" | "ar"; slug: string }[];
}

/** The service page as the API sends it, through the site's own `/store/v1` rewrite. */
async function apiService(request: APIRequestContext, slug: string, locale: "en" | "ar" = "en"): Promise<ApiService> {
  const res = await request.get(`/store/v1/services/${encodeURIComponent(slug)}?locale=${locale}`);
  expect(res.status(), `${slug}: ${await res.text()}`).toBe(200);
  return (await res.json()) as ApiService;
}

/** The first page of the catalog of one language (the demo has fewer than 100 listed services). */
async function apiServices(request: APIRequestContext, locale: "en" | "ar"): Promise<ApiService[]> {
  const res = await request.get(`/store/v1/services?locale=${locale}&_start=0&_end=100`);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as ApiService[];
}

/**
 * `unit × quantity` shown as US dollars with two decimals, by integer math on the API's 4-decimal string: the amount the
 * site prints for an estimate ("$64.95"). Half cents round up, like the site's formatter.
 */
function dollars(unit: string, quantity: number): string {
  const match = /^(\d+)\.(\d{4})$/.exec(unit);
  if (!match) throw new Error(`Not a 4-decimal price: ${unit}`);
  const units = BigInt(match[1] + match[2]) * BigInt(quantity);
  const cents = (units + BigInt(50)) / BigInt(100);
  const whole = (cents / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${whole}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;
}

/** The card of a service in a list: the article with its title link. */
function cardOf(page: Page, title: string): Locator {
  return page.getByRole("article").filter({ has: page.getByRole("link", { name: title, exact: true }) });
}

/** The purchase card of a service page. */
function purchaseCard(page: Page): Locator {
  return page.getByRole("complementary", { name: "Your order" });
}

/** Opens a service page and waits until `check` holds, reloading: a catalog value changed a moment ago may still be cached. */
async function expectPage(page: Page, path: string, check: () => Promise<void>) {
  await expect(async () => {
    await page.goto(path);
    await check();
  }).toPass({ timeout: 90_000, intervals: [5_000] });
}

/** What no page of the shop may say: a pre-order, a sold-out state or a stock number. */
const FORBIDDEN = /pre-?order|out of stock|sold out|\b\d+\s+(left|in stock|remaining)\b/i;

test.describe("delivery in the page's language", () => {
  test("English cards print the staff note or the minutes in English, never the supplier's raw text", async ({ page, request }) => {
    const rows = await apiServices(request, "en");
    expect(rows.length).toBeGreaterThan(0);
    await page.goto("/en/services");
    const cards = page.getByRole("article");
    await expect(cards).not.toHaveCount(0);
    for (const row of rows) {
      const card = cardOf(page, row.title);
      if ((await card.count()) === 0) continue; // not on the first page of the list
      const note = row.etaText.trim();
      if (note) {
        await expect(card, row.title).toContainText(`Delivery: ${note}`);
      } else {
        await expect(card, row.title).toContainText(/Delivery: \d+ (min|hr|day)/);
      }
    }
  });

  test("Arabic cards print Arabic text: the staff note, else the minutes in Arabic", async ({ page, request }) => {
    const rows = await apiServices(request, "ar");
    expect(rows.length).toBeGreaterThan(0);
    await page.goto("/ar/services");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    for (const row of rows) {
      const card = cardOf(page, row.title);
      await expect(card, row.title).toHaveCount(1);
      const note = row.etaText.trim();
      // The sentence a screen reader hears, and the visible time.
      if (note) await expect(card, row.title).toContainText(`التسليم: ${note}`);
      else await expect(card, row.title).toContainText(/التسليم: /);
      // No English unit leaks into an Arabic card.
      await expect(card, row.title).not.toContainText(/\b\d+\s*(min|hr|hour|hours|day|days)\b/i);
    }
  });

  test("the service page's delivery row shows the staff note as written, else 'Delivered within' the minutes", async ({ page, request }) => {
    const { range } = fixtures();
    const row = await apiService(request, range.slug);
    await page.goto(`/en/services/${range.slug}`);
    const delivery = purchaseCard(page).locator("dt", { hasText: "Delivery" }).locator("xpath=following-sibling::dd[1]");
    await expect(delivery).toContainText(row.etaText.trim() || /Delivered within \d+ (min|hr|day)/);
    // The label is "Delivery", not the old "Delivery time" / "Estimated time".
    await expect(purchaseCard(page)).not.toContainText(/Estimated time|Delivery time/);
  });
});

test.describe("availability", () => {
  test("the stocked fixture shows In stock on its card and on its page; an on-request service does not", async ({ page, request }) => {
    const { stocked, range } = fixtures();
    const stockedRow = await apiService(request, stocked.slug);
    const rangeRow = await apiService(request, range.slug);
    expect(stockedRow.availability).toBe("in_stock");

    // The global setup may have just made the fixture in stock: read the cached list and page through `toPass`.
    await expectPage(page, "/en/services", async () => {
      await expect(cardOf(page, stockedRow.title)).toContainText("In stock", { timeout: 3_000 });
    });
    await expect(cardOf(page, rangeRow.title)).toBeVisible();
    await expect(cardOf(page, rangeRow.title)).not.toContainText("In stock");

    await expectPage(page, `/en/services/${stocked.slug}`, async () => {
      await expect(purchaseCard(page).getByText("In stock")).toBeVisible({ timeout: 3_000 });
    });
    await expect(purchaseCard(page)).not.toContainText("per unit"); // one per order: the price alone

    await page.goto(`/en/services/${range.slug}`);
    await expect(purchaseCard(page)).not.toContainText("In stock");
    // The delivery row still tells the buyer when it arrives.
    await expect(purchaseCard(page)).toContainText("Delivery");
  });

  test("Arabic: the stocked service says متوفر on its card and on its page", async ({ page, request }) => {
    const { stocked } = fixtures();
    const english = await apiService(request, stocked.slug);
    const arabicSlug = english.alternates.find((alt) => alt.locale === "ar")?.slug;
    expect(arabicSlug, "the stocked fixture needs an Arabic page").toBeTruthy();
    const arabic = await apiService(request, arabicSlug!, "ar");

    await expectPage(page, "/ar/services", async () => {
      await expect(cardOf(page, arabic.title)).toContainText("متوفر", { timeout: 3_000 });
    });
    await expectPage(page, `/ar/services/${arabicSlug}`, async () => {
      await expect(page.getByRole("complementary", { name: "طلبك" }).getByText("متوفر")).toBeVisible({ timeout: 3_000 });
    });
  });

  test("no page says Pre-order, Out of stock or a number left", async ({ page }) => {
    const { packs, range, exact } = fixtures();
    for (const path of ["/en", "/en/services", `/en/services/${packs.slug}`, `/en/services/${range.slug}`, `/en/services/${exact.slug}`]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }), path).toBeVisible();
      await expect(page.locator("body"), path).not.toContainText(FORBIDDEN);
    }
  });
});

test.describe("price and quantity on the service page", () => {
  test("packs: per unit, From the smallest pack and the three packs with their estimates", async ({ page, request }) => {
    const { packs } = fixtures();
    const row = await apiService(request, packs.slug);
    expect(row.quantity.options).toEqual([5, 10, 25]);
    const unit = row.price.gross;

    await expectPage(page, `/en/services/${packs.slug}`, async () => {
      await expect(purchaseCard(page).getByText("per unit", { exact: true })).toBeVisible({ timeout: 3_000 });
    });
    const card = purchaseCard(page);
    await expect(card.getByText(`From ${dollars(unit, 5)}`, { exact: true })).toBeVisible();
    await expect(card).toContainText("Packs of 5, 10, 25");
    const list = card.getByRole("list", { name: "Packs" });
    await expect(list.getByRole("listitem")).toHaveText([
      `5 for about ${dollars(unit, 5)}`,
      `10 for about ${dollars(unit, 10)}`,
      `25 for about ${dollars(unit, 25)}`,
    ]);
    await expect(card).toContainText("The checkout shows your exact total");
  });

  test("range: '2 to 50 per order' and From two units", async ({ page, request }) => {
    const { range } = fixtures();
    const row = await apiService(request, range.slug);
    expect(row.quantity).toMatchObject({ min: 2, max: 50, options: [] });

    await expectPage(page, `/en/services/${range.slug}`, async () => {
      await expect(purchaseCard(page).getByText("2 to 50 per order")).toBeVisible({ timeout: 3_000 });
    });
    const card = purchaseCard(page);
    await expect(card.getByText("per unit", { exact: true })).toBeVisible();
    await expect(card.getByText(`From ${dollars(row.price.gross, 2)}`, { exact: true })).toBeVisible();
    await expect(card.getByRole("list", { name: "Packs" })).toHaveCount(0);
  });

  test("exact N: '5 per order' and '5 for' five units, with no From and no packs", async ({ page, request }) => {
    const { exact } = fixtures();
    const row = await apiService(request, exact.slug);
    expect(row.quantity).toMatchObject({ min: 5, max: 5, options: [] });

    await expectPage(page, `/en/services/${exact.slug}`, async () => {
      await expect(purchaseCard(page).getByText("5 per order")).toBeVisible({ timeout: 3_000 });
    });
    const card = purchaseCard(page);
    await expect(card.getByText("per unit", { exact: true })).toBeVisible();
    await expect(card.getByText(`5 for ${dollars(row.price.gross, 5)}`, { exact: true })).toBeVisible();
    await expect(card.getByText(/^From /)).toHaveCount(0);
    await expect(card.getByRole("list", { name: "Packs" })).toHaveCount(0);
  });

  test("the quick view of the packs fixture shows the same", async ({ page, request }) => {
    const { packs } = fixtures();
    const row = await apiService(request, packs.slug);
    const unit = row.price.gross;

    await expectPage(page, "/en/services", async () => {
      await expect(page.getByRole("link", { name: `Quick view: ${row.title}` })).toBeVisible({ timeout: 3_000 });
    });
    await page.getByRole("link", { name: `Quick view: ${row.title}` }).click();
    const dialog = page.getByRole("dialog", { name: row.title });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/en/quick-view/${packs.slug}$`));
    await expect(dialog.getByText("per unit", { exact: true })).toBeVisible();
    await expect(dialog.getByText(`From ${dollars(unit, 5)}`, { exact: true })).toBeVisible();
    await expect(dialog.getByRole("list", { name: "Packs" }).getByRole("listitem")).toHaveText([
      `5 for about ${dollars(unit, 5)}`,
      `10 for about ${dollars(unit, 10)}`,
      `25 for about ${dollars(unit, 25)}`,
    ]);
    await expect(dialog).toContainText("Packs of 5, 10, 25");
    await expect(dialog).not.toContainText(FORBIDDEN);
  });

  test("JOD shows exactly two decimals on the unit price and on every estimate", async ({ page, context, baseURL }) => {
    const { range } = fixtures();
    await context.addCookies([{ name: "gsm_currency", value: "JOD", url: baseURL! }]);
    await expectPage(page, `/en/services/${range.slug}`, async () => {
      await expect(purchaseCard(page).locator(".num").first()).toContainText("JOD", { timeout: 3_000 });
    });
    const amounts = await purchaseCard(page).locator(".num").allTextContents();
    expect(amounts.length, "the unit price and the From estimate").toBeGreaterThanOrEqual(2);
    for (const amount of amounts) {
      expect(amount, amount).toMatch(/\d\.\d{2}$/);
      expect(amount, amount).not.toMatch(/\d\.\d{3}/);
    }
  });
});

test.describe("the language switch (alternates)", () => {
  test("an English slug on the Arabic page redirects to the Arabic page of the same service", async ({ page }) => {
    await page.goto("/ar/services/icloud-clean-lost-check");
    await expect(page).toHaveURL(/\/ar\/services\/fahs-icloud$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("فحص حالة iCloud");
    await page.goto("/en/services/fahs-icloud");
    await expect(page).toHaveURL(/\/en\/services\/icloud-clean-lost-check$/);
  });

  test("the hreflang links come from `alternates`: both ways for a translated service, none for an English-only one", async ({ page }) => {
    await page.goto("/en/services/icloud-clean-lost-check");
    await expect(page.locator('link[rel="alternate"][hreflang="ar"]')).toHaveAttribute("href", /\/ar\/services\/fahs-icloud$/);
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/en\/services\/icloud-clean-lost-check$/);

    await page.goto("/ar/services/fahs-icloud");
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/en\/services\/icloud-clean-lost-check$/);

    // An English-only service: wait for its own metadata (the canonical link), then check there is no Arabic alternate.
    await page.goto("/en/services/t-mobile-usa-unlock");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en\/services\/t-mobile-usa-unlock$/);
    await expect(page.locator('link[rel="alternate"][hreflang="ar"]')).toHaveCount(0);
  });

  test("a service with no Arabic page is a 404 in Arabic", async ({ page }) => {
    await page.goto("/ar/services/t-mobile-usa-unlock");
    await expect(page.getByRole("heading", { name: "الصفحة غير موجودة" })).toBeVisible();
  });
});

test.describe("service pictures", () => {
  test("the pictured fixture's card shows its picture through next/image", async ({ page, request }) => {
    const { pictured } = fixtures();
    const row = await apiService(request, pictured.slug);
    expect(row.imageUrl, "the global setup uploads a picture to this listing").toMatch(/^\/store\/v1\/media\//);

    await expectPage(page, "/en/services", async () => {
      await expect(cardOf(page, row.title)).toBeVisible({ timeout: 3_000 });
    });
    const card = cardOf(page, row.title);
    await card.scrollIntoViewIfNeeded();
    const picture = card.locator("img").first();
    await expect(picture).toHaveAttribute("src", /^\/_next\/image\?url=/);
    const src = (await picture.getAttribute("src")) ?? "";
    expect(decodeURIComponent(src)).toContain("/store/v1/media/");
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);

    // The optimizer answers an image for that URL.
    const optimized = await page.request.get(src);
    expect(optimized.status()).toBe(200);
    expect(optimized.headers()["content-type"]).toMatch(/^image\//);
  });

  test("the pictured fixture's page shows the picture in its header; a service without one shows no media image", async ({ page, request }) => {
    const { pictured, range } = fixtures();
    const header = page.locator("header").filter({ has: page.getByRole("heading", { level: 1 }) });
    const picture = header.locator("img").first();
    // The global setup may have just given the listing its picture: read the cached page through `toPass`.
    await expectPage(page, `/en/services/${pictured.slug}`, async () => {
      await expect(picture).toHaveAttribute("src", /store(%2F|\/)v1(%2F|\/)media/, { timeout: 3_000 });
    });
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);

    expect((await apiService(request, range.slug)).imageUrl).toBeNull();
    await page.goto(`/en/services/${range.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('img[src*="media"]')).toHaveCount(0);
  });
});
