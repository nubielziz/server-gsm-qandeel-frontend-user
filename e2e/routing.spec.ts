// Routing layer: the one language (decision 039: /en only, old /ar addresses answer 308), the language-less links of
// emails, optimistic sign-in redirects and the API rewrites. HTTP-level checks, no UI.
import { expect, test } from "./fixtures";

/** The Location of a redirect, as a path with its query. */
const target = (location: string | undefined) => {
  const to = new URL(location ?? "", "http://x");
  return `${to.pathname}${to.search}`;
};

test.describe("old Arabic addresses", () => {
  test("/ar and every path under it answer 308 to the same path under /en, with the query", async ({ request }) => {
    const cases: [string, string][] = [
      ["/ar", "/en"],
      ["/ar/services?brand=x", "/en/services?brand=x"],
      ["/ar/help", "/en/help"],
      ["/ar/track/t_abc", "/en/track/t_abc"],
      ["/ar/support/tickets/t_abc", "/en/support/tickets/t_abc"],
      ["/ar/checkout/resume?token=tok", "/en/checkout/resume?token=tok"],
      ["/ar/unsubscribe?token=tok", "/en/unsubscribe?token=tok"],
      ["/ar/merchant/register?ref=ABC", "/en/merchant/register?ref=ABC"],
    ];
    for (const [from, to] of cases) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status(), from).toBe(308);
      expect(target(res.headers()["location"]), from).toBe(to);
    }
  });

  test("the redirect does not depend on a cookie or Accept-Language, and /arabic is not an old address", async ({ request }) => {
    const res = await request.get("/ar/services", {
      maxRedirects: 0,
      headers: { "accept-language": "ar-JO,ar;q=0.9", cookie: "gsm_locale=ar" },
    });
    expect(res.status()).toBe(308);
    expect(target(res.headers()["location"])).toBe("/en/services");

    const other = await request.get("/arabic", { maxRedirects: 0 });
    expect(other.status()).toBe(307);
    expect(target(other.headers()["location"])).toBe("/en/arabic");
  });
});

test.describe("old service addresses (the two rows the demo seed keeps, plan 30 §4.5 and §7.1)", () => {
  test("an old service address ends on the English page of the same service; one with no page on sale, on the list", async ({ page, request }) => {
    // Where the seeded old address leads (the seed names one service of a seeded listing; its slug is the API's).
    const answer = await request.get("/store/v1/legacy-slugs/service/legacy-demo-service");
    expect(answer.status(), await answer.text()).toBe(200);
    const { slug } = (await answer.json()) as { path: string; slug: string | null };
    expect(slug, "the seeded old address leads to a service on sale").toBeTruthy();

    const cases: [string, string][] = [
      ["legacy-demo-service", `/en/services/${slug}`],
      ["legacy-demo-gone", "/en/services"],
    ];
    for (const [old, final] of cases) {
      // First hop: a real 308 (next.config.ts), for every /ar address.
      const first = await request.get(`/ar/services/${old}`, { maxRedirects: 0 });
      expect(first.status(), old).toBe(308);
      expect(target(first.headers()["location"]), old).toBe(`/en/services/${old}`);

      // The page in between is never indexed, in any of the forms its answer takes. In development, and on the first hit of
      // a production build, it streams: a 200 whose full answer says `noindex` and carries the redirect. A production build
      // (`next start`) that already resolved the address answers 308: with a `Location` (the final address; Next sometimes
      // writes that header twice with the same value), or, when the redirect comes out of the postponed part of the page,
      // without one and with the same `noindex` page (all seen on 2026-11-17).
      const between = await request.get(`/en/services/${old}`, { maxRedirects: 0 });
      const locations = between
        .headersArray()
        .filter((header) => header.name.toLowerCase() === "location")
        .map((header) => target(header.value));
      if (locations.length > 0) {
        expect(between.status(), old).toBe(308);
        expect([...new Set(locations)], old).toEqual([final]);
      } else {
        expect([200, 308], old).toContain(between.status());
        expect(await between.text(), old).toMatch(/<meta name="robots" content="noindex[^"]*"/);
      }

      // Second hop: the browser follows the redirect written into that page and ends on the English address.
      await page.goto(`/ar/services/${old}`);
      await expect.poll(() => new URL(page.url()).pathname, { message: old, timeout: 15_000 }).toBe(final);
    }
  });
});

test.describe("language-less links", () => {
  test("an emailed link goes to /en and keeps the query, whatever cookie or Accept-Language is sent", async ({ request }) => {
    const cases: [string, string][] = [
      ["/sign-in?token=t", "/en/sign-in?token=t"],
      ["/merchant/register?ref=r", "/en/merchant/register?ref=r"],
      ["/merchant/set-password?token=xyz", "/en/merchant/set-password?token=xyz"],
      ["/support/tickets/t_abc", "/en/support/tickets/t_abc"],
      ["/", "/en"],
    ];
    const headers: Record<string, string>[] = [
      {},
      { "accept-language": "ar-JO,ar;q=0.9,en;q=0.5" },
      { "accept-language": "en", cookie: "gsm_locale=ar" },
    ];
    for (const [from, to] of cases) {
      for (const extra of headers) {
        const res = await request.get(from, { maxRedirects: 0, headers: extra });
        expect(res.status(), `${from} ${JSON.stringify(extra)}`).toBe(307);
        expect(target(res.headers()["location"]), `${from} ${JSON.stringify(extra)}`).toBe(to);
      }
    }
  });

  test("an /en page is served as it is", async ({ request }) => {
    const res = await request.get("/en/services", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });
});

test.describe("English only in the markup and the sitemap", () => {
  test("pages are lang=en dir=ltr and name no other language (no hreflang)", async ({ request }) => {
    const first = await request.get("/store/v1/services?_start=0&_end=1");
    expect(first.status(), await first.text()).toBe(200);
    const [service] = (await first.json()) as { slug: string }[];
    const paths = ["/en", "/en/services", "/en/help", "/en/track", "/en/sign-in"];
    if (service) paths.push(`/en/services/${encodeURIComponent(service.slug)}`);
    for (const path of paths) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      const html = await res.text();
      expect(html, path).toMatch(/<html[^>]*\slang="en"[^>]*\sdir="ltr"/);
      expect(html.toLowerCase(), path).not.toContain("hreflang");
      expect(html, path).not.toMatch(/href="\/ar[/"?#]/);
    }
  });

  test("sitemap.xml lists no /ar address and no alternate", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();
    expect(xml).toContain("/en</loc>");
    expect(xml).not.toMatch(/\/ar[/<?]/);
    expect(xml).not.toContain("hreflang");
    expect(xml).not.toContain("xhtml:link");
  });
});

test.describe("private areas", () => {
  test("account and merchant portal redirect to sign-in without a session", async ({ request }) => {
    const account = await request.get("/en/account/orders", { maxRedirects: 0 });
    expect(account.status()).toBe(307);
    const to = new URL(account.headers()["location"], "http://x");
    expect(to.pathname).toBe("/en/sign-in");
    expect(to.searchParams.get("as")).toBe("customer");
    expect(to.searchParams.get("next")).toBe("/en/account/orders");

    const merchant = await request.get("/en/merchant/orders", { maxRedirects: 0 });
    expect(new URL(merchant.headers()["location"], "http://x").searchParams.get("as")).toBe("merchant");
  });

  test("merchant email-link pages stay public", async ({ request }) => {
    for (const path of ["/en/merchant/register?ref=ABC", "/en/merchant/set-password?token=t", "/en/merchant/verify-email?token=t"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).not.toBe(307);
    }
  });
});

test.describe("API rewrites", () => {
  test("/store/v1 reaches the API on the site's origin", async ({ request }) => {
    const res = await request.get("/store/v1/config");
    expect(res.status()).toBe(200);
    expect((await res.json()).baseCurrency).toBe("USD");
  });

  test("/client answers 401 without a session (problem+json)", async ({ request }) => {
    const res = await request.get("/client/auth/me");
    expect(res.status()).toBe(401);
    expect(res.headers()["content-type"]).toContain("application/problem+json");
    expect((await res.json()).code).toBe("UNAUTHORIZED");
  });
});
