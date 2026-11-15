// Content features of plan F32 (BH §2.5): the sitemap's content pages and the helpful vote under a help article.
// Runs against the isolated demo backend (:3100). Rules (F03): no global switch is touched; the pages the sitemap test makes
// are its own (unique slug) and are hidden again at the end; the vote needs no account and no Turnstile.
// The sitemap and the page list are cached on the site (`content` profile: up to 10 minutes, plus one more cycle for the
// background refresh), so the sitemap check polls with a ceiling of 12 minutes and runs on desktop only.
import type { Locator, Page } from "@playwright/test";
import { adminCall } from "./admin";
import { expect, test } from "./fixtures";

/** How long a new page may take to show up in `/sitemap.xml` (see the header). */
const SITEMAP_CEILING = 12 * 60_000;

/** A seeded English article of the demo data (e2e/store.spec.ts reads it too). */
const ARTICLE = "3-where-is-my-order";
const OTHER_ARTICLE = "2-can-i-cancel-my-order";

const isVote = (url: string) => /\/store\/v1\/help\/[^/]+\/vote$/.test(new URL(url).pathname);

/** Waits until React has attached to an element: before that a click does nothing. */
async function hydrated(locator: Locator) {
  await expect.poll(() => locator.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps")))).toBe(true);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
}

/** A problem+json answer, as the API sends one. */
function problem(status: number, code: string, detail: string) {
  return JSON.stringify({ type: `https://errors.gsm.example/${code.toLowerCase()}`, title: detail, status, code, detail, requestId: `e2e-${status}-vote` });
}

interface CreatedPage {
  id: number;
}

/** Creates a static page as staff and publishes it (`POST /admin/content-pages`, then `…/:id/publish`). */
async function publishPage(locale: "en" | "ar", slug: string, title: string): Promise<CreatedPage> {
  const created = await adminCall<CreatedPage>("POST", "/admin/content-pages", { json: { kind: "static", title, locale, slug, bodyMd: "Made by the F32 sitemap spec." } });
  await adminCall("POST", `/admin/content-pages/${created.body.id}/publish`, { json: { published: true } });
  return created.body;
}

test.describe("sitemap", () => {
  test("lists a published content page in both languages and skips a noindex page", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "The sitemap is the same on every device: desktop only.");
    test.setTimeout(SITEMAP_CEILING + 120_000);

    // Staff cannot mark a page noindex (no admin route sets it), so the demo data's own noindex page is the subject.
    const listed = await request.get("/store/v1/pages?locale=en&_start=0&_end=100");
    expect(listed.status(), await listed.text()).toBe(200);
    const rows = (await listed.json()) as { slug: string; noindex: boolean }[];
    const noindexSlug = rows.find((row) => row.noindex)?.slug;
    if (!noindexSlug) testInfo.annotations.push({ type: "note", description: "The demo data has no noindex page: only the published pages are checked." });

    const slug = `e2e-sitemap-${Date.now().toString(36)}`;
    const made = [await publishPage("en", slug, "E2E sitemap page"), await publishPage("ar", slug, "صفحة اختبار الخريطة")];
    try {
      await expect(async () => {
        const res = await request.get("/sitemap.xml");
        expect(res.status()).toBe(200);
        const xml = await res.text();
        expect(xml, "the published English page").toContain(`/en/pages/${slug}</loc>`);
        expect(xml, "the published Arabic page").toContain(`/ar/pages/${slug}</loc>`);
        if (noindexSlug) expect(xml, "a page marked noindex is live but never listed").not.toContain(`/en/pages/${noindexSlug}</loc>`);
        // What the sitemap held before is still there.
        expect(xml).toContain("/en/services</loc>");
        expect(xml).toContain("/ar/help</loc>");
        // `lastModified` is the page's `updatedAt`.
        expect(xml).toMatch(new RegExp(`/en/pages/${slug}</loc>\\s*<lastmod>[^<]+</lastmod>`));
      }).toPass({ timeout: SITEMAP_CEILING, intervals: [10_000] });
    } finally {
      // The pages are this test's own: hide them again so the demo's public pages stay as they were.
      for (const page of made) await adminCall("POST", `/admin/content-pages/${page.id}/publish`, { json: { published: false } }).catch(() => undefined);
    }
  });
});

test.describe("help vote", () => {
  test("Yes sends helpful true, shows the thanks and locks both buttons, also after a reload", async ({ page }) => {
    await page.goto(`/en/help/${ARTICLE}`);
    await expect(page.getByRole("heading", { level: 1, name: "Where is my order?" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Was this article helpful?" })).toBeVisible();
    const yes = page.getByRole("button", { name: "Yes", exact: true });
    const no = page.getByRole("button", { name: "No", exact: true });
    await expect(yes).toBeEnabled();
    await expect(no).toBeEnabled();
    await expectNoHorizontalOverflow(page);
    await hydrated(yes);

    const sent = page.waitForResponse((r) => isVote(r.url()) && r.request().method() === "POST");
    await yes.click();
    const response = await sent;
    expect(response.status()).toBe(204);
    expect(response.request().postDataJSON()).toEqual({ helpful: true });
    // The route is public: no security check token, and no session means no CSRF token either.
    expect(response.request().headers()["x-turnstile-token"]).toBeUndefined();

    const thanks = page.getByText("Thank you for your feedback.", { exact: true });
    await expect(thanks).toBeVisible();
    await expect(thanks).toBeFocused();
    await expect(yes).toBeDisabled();
    await expect(no).toBeDisabled();
    await expect(page.getByRole("alert").filter({ hasText: "could not record" })).toHaveCount(0);
    // No count and no word on whether the vote counted.
    await expect(page.getByText(/helpful (yes|no)|\d+ (people|votes?)|counted/i)).toHaveCount(0);

    // The article id is remembered for the tab: after a reload the thanks is back and the buttons stay locked.
    await page.reload();
    await expect(page.getByText("Thank you for your feedback.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Yes", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "No", exact: true })).toBeDisabled();

    // Another article of the same tab is still open for a vote.
    await page.goto(`/en/help/${OTHER_ARTICLE}`);
    await expect(page.getByRole("heading", { level: 1, name: "Can I cancel my order?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Yes", exact: true })).toBeEnabled();
    await expect(page.getByText("Thank you for your feedback.")).toHaveCount(0);
  });

  test("No sends helpful false; the Arabic page speaks Arabic", async ({ page }) => {
    await page.goto(`/ar/help/${ARTICLE}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("group", { name: "هل كانت هذه المقالة مفيدة؟" })).toBeVisible();
    const yes = page.getByRole("button", { name: "نعم", exact: true });
    const no = page.getByRole("button", { name: "لا", exact: true });
    await expectNoHorizontalOverflow(page);
    await hydrated(no);

    const sent = page.waitForResponse((r) => isVote(r.url()) && r.request().method() === "POST");
    await no.click();
    const response = await sent;
    expect(response.status()).toBe(204);
    expect(response.request().postDataJSON()).toEqual({ helpful: false });
    await expect(page.getByText("شكرًا على ملاحظاتك.", { exact: true })).toBeVisible();
    await expect(yes).toBeDisabled();
    await expect(no).toBeDisabled();
  });

  test("a mocked 404 shows the error, keeps the buttons open and the next try can succeed", async ({ page }) => {
    await page.route(
      (url) => isVote(url.href),
      (route) => route.fulfill({ status: 404, contentType: "application/problem+json", body: problem(404, "NOT_FOUND", "Help article not found.") }),
      { times: 1 },
    );
    await page.goto(`/en/help/${ARTICLE}`);
    const yes = page.getByRole("button", { name: "Yes", exact: true });
    const no = page.getByRole("button", { name: "No", exact: true });
    await hydrated(yes);

    await yes.click();
    const alert = page.getByRole("alert").filter({ hasText: "We could not record your answer. Try again later." });
    await expect(alert).toBeVisible();
    await expect(alert).toBeFocused();
    await expect(page.getByText("Thank you for your feedback.")).toHaveCount(0);
    await expect(yes).toBeEnabled();
    await expect(no).toBeEnabled();

    // The mock answered once: the second press reaches the API.
    const sent = page.waitForResponse((r) => isVote(r.url()) && r.request().method() === "POST");
    await no.click();
    expect((await sent).status()).toBe(204);
    await expect(page.getByText("Thank you for your feedback.", { exact: true })).toBeVisible();
    await expect(alert).toHaveCount(0);
    await expect(yes).toBeDisabled();
    await expect(no).toBeDisabled();
  });

  test("a mocked 429 shows the wait, and the Arabic page shows it in Arabic", async ({ page }) => {
    await page.route(
      (url) => isVote(url.href),
      (route) =>
        route.fulfill({ status: 429, contentType: "application/problem+json", headers: { "retry-after": "42" }, body: problem(429, "RATE_LIMITED", "Too many requests.") }),
    );
    await page.goto(`/en/help/${ARTICLE}`);
    const yes = page.getByRole("button", { name: "Yes", exact: true });
    await hydrated(yes);
    await yes.click();
    const alert = page.getByRole("alert").filter({ hasText: "Too many attempts. Please wait and try again." });
    await expect(alert).toContainText("Try again in 42 s.");
    await expect(yes).toBeEnabled();
    await expect(page.getByText("Thank you for your feedback.")).toHaveCount(0);

    await page.goto(`/ar/help/${ARTICLE}`);
    const arabicYes = page.getByRole("button", { name: "نعم", exact: true });
    await hydrated(arabicYes);
    await arabicYes.click();
    const arabicAlert = page.getByRole("alert").filter({ hasText: "محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى." });
    await expect(arabicAlert).toContainText("حاول مرة أخرى بعد 42 ث.");
    await expect(arabicYes).toBeEnabled();
  });
});
