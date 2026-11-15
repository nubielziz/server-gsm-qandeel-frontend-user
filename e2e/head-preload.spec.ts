// The font preload is a <link> in the HTML <head>, also on a page the server has regenerated (perf plan P2.2).
// `reactMaxHeadersLength: 1` (next.config.ts) makes React write every preload into the prerendered head instead of the
// `Link` response header. A regenerated entry drops that header, so Inter used to start about 600 ms late on catalog pages,
// which revalidate every 30 s. HTTP-level checks plus one browser navigation; run it against a production build
// (`E2E_BASE_URL=http://localhost:5176`): the dev server does not prerender.
import { expect, test } from "./fixtures";

/** A catalog page: its data (`catalog` cache profile, next.config.ts) revalidates after 30 s. */
const CATALOG = "/en/services";
/** `revalidate` of the `catalog` profile, in ms, plus a margin: after this the prerendered entry is stale. */
const STALE_AFTER = 30_000 + 5_000;
/** Time for the background regeneration that a stale request starts (a few cached API reads). */
const REGENERATION = 5_000;

/** The part of the document before `</head>`. */
function headOf(html: string): string {
  const end = html.indexOf("</head>");
  expect(end, "the document has a </head>").toBeGreaterThan(0);
  return html.slice(0, end);
}

/** The `href` of every `<link rel="preload" as="font" crossorigin>` in the head; fonts only work preloaded with CORS. */
function fontPreloads(head: string): string[] {
  const hrefs: string[] = [];
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/\brel="preload"/i.test(tag) || !/\bas="font"/i.test(tag)) continue;
    expect(tag, "a font preload needs crossorigin").toMatch(/\bcrossorigin\b/i);
    const href = /\bhref="([^"]+)"/i.exec(tag)?.[1];
    expect(href, "the font preload has an href").toBeTruthy();
    hrefs.push(href as string);
  }
  return hrefs.sort();
}

/** True when the `Link` response header carries a font preload (it must not: the head does). */
function headerPreloadsFont(link: string | undefined): boolean {
  return /\bas="?font/i.test(link ?? "");
}

test.describe("font preload in the document head", () => {
  for (const path of ["/en", "/ar", "/en/services", "/ar/services"]) {
    test(`${path}: the head holds the font preload as a <link>, not only the Link header`, async ({ request }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "The document is the same on every device: desktop only.");
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      expect(headerPreloadsFont(res.headers()["link"])).toBe(false);
      const preloads = fontPreloads(headOf(await res.text()));
      expect(preloads.length, "at least the Inter file is preloaded").toBeGreaterThanOrEqual(1);
      for (const href of preloads) expect(href).toMatch(/^\/_next\/static\/media\/.+\.woff2$/);
    });
  }

  test("a catalog page regenerated after a client navigation keeps the preload in its head", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "The document is the same on every device: desktop only.");
    test.setTimeout(STALE_AFTER + REGENERATION + 90_000);

    // The entry as the build (or its first render) made it.
    const before = fontPreloads(headOf(await (await request.get(CATALOG)).text()));
    expect(before.length, "the first render preloads the font in its head").toBeGreaterThanOrEqual(1);

    // Only a real (non-prefetch) request may reach the server, so the click below cannot be answered from the router's
    // cache and must hit the stale entry. Prefetches answer with an aborted request, which the router tolerates.
    await page.route("**/*", (route) => {
      const headers = route.request().headers();
      return headers["next-router-prefetch"] || headers["next-router-segment-prefetch"] ? route.abort() : route.continue();
    });
    await page.goto("/en");
    await page.waitForTimeout(STALE_AFTER); // hydrated by now, and the catalog entry is stale

    // A client navigation: the router asks for the flight payload (`rsc` header). The stale entry is served and the
    // server regenerates it in the background. If no such request is sent the page was not navigated by the router.
    const flight = page.waitForRequest(
      (req) => new URL(req.url()).pathname === CATALOG && req.headers()["rsc"] !== undefined && !req.headers()["next-router-prefetch"],
    );
    await page.locator(`a[href="${CATALOG}"]:visible`).first().click();
    await flight;
    await expect(page).toHaveURL(new RegExp(`${CATALOG}$`));

    // The document now comes from the regenerated entry.
    await page.waitForTimeout(REGENERATION);
    const reloaded = await page.reload();
    expect(reloaded, "the reload answers").not.toBeNull();
    expect(headerPreloadsFont(reloaded!.headers()["link"])).toBe(false);
    const after = fontPreloads(headOf(await reloaded!.text()));
    expect(after, "the regenerated page preloads the same font files in its head").toEqual(before);
  });
});
