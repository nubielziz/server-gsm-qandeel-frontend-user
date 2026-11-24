// Routing layer: the one language (decision 039: /en only, old /ar addresses answer 308), the language-less links of
// emails, the one account area (every old portal and ticket address answers 308 to it), the optimistic sign-in redirect and
// the API rewrites. HTTP-level checks, no UI.
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
      ["/ar/merchant/register?from=x", "/en/merchant/register?from=x"],
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

test.describe("retired pages", () => {
  test("the old verification address answers 308 to the settings, with or without /en, before sign-in", async ({ request }) => {
    const cases: [string, string][] = [
      ["/en/merchant/settings/verification", "/en/account/settings"],
      ["/merchant/settings/verification", "/en/account/settings"],
    ];
    for (const [from, to] of cases) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status(), from).toBe(308);
      expect(target(res.headers()["location"]), from).toBe(to);
    }
  });

  test("the old referrals address answers 308 to the account overview, with or without /en, query kept", async ({ request }) => {
    const cases: [string, string][] = [
      ["/en/merchant/referrals", "/en/account"],
      ["/merchant/referrals", "/en/account"],
      // A bookmark of a filtered view still lands on the overview: the old query rides along and the overview ignores it.
      ["/en/merchant/referrals?status=approved&period=2026-11", "/en/account?status=approved&period=2026-11"],
    ];
    for (const [from, to] of cases) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status(), from).toBe(308);
      expect(target(res.headers()["location"]), from).toBe(to);
    }
  });

  test("the old Webhooks addresses answer 308 to the API keys page, with or without /en, before sign-in", async ({ request }) => {
    const cases: [string, string][] = [
      ["/en/merchant/webhooks", "/en/account/settings/api-keys"],
      ["/en/merchant/webhooks/12", "/en/account/settings/api-keys"],
      ["/merchant/webhooks", "/en/account/settings/api-keys"],
      ["/merchant/webhooks/12", "/en/account/settings/api-keys"],
    ];
    for (const [from, to] of cases) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status(), from).toBe(308);
      expect(target(res.headers()["location"]), from).toBe(to);
    }
  });
});

/**
 * Every old portal and ticket address and the page that took its place (the table of lib/account/legacy-paths.ts, written out
 * here on purpose so a wrong row of the table fails). A parameter is a made-up id.
 */
const OLD_ADDRESSES: [string, string][] = [
  ["/merchant", "/account"],
  // The retired price list ends at the shop's services (decision 003); an old order form address keeps its own page.
  ["/merchant/services", "/services"],
  ["/merchant/services/9", "/account/services/9"],
  ["/account/services", "/services"],
  ["/merchant/orders", "/account/orders"],
  ["/merchant/orders/42", "/account/orders/42"],
  ["/merchant/wallet", "/account/wallet"],
  ["/merchant/wallet/top-up", "/account/wallet/add-funds"],
  ["/merchant/invoices", "/account/invoices"],
  ["/merchant/invoices/17", "/account/invoices/17"],
  ["/merchant/api-keys", "/account/settings/api-keys"],
  ["/merchant/webhooks", "/account/settings/api-keys"],
  ["/merchant/webhooks/12", "/account/settings/api-keys"],
  ["/merchant/webhooks/12/deliveries", "/account/settings/api-keys"],
  ["/merchant/referrals", "/account"],
  ["/merchant/notifications", "/account/notifications"],
  ["/merchant/support", "/account/support"],
  ["/merchant/support/new", "/account/support/new"],
  ["/merchant/support/5", "/account/support/5"],
  ["/merchant/settings", "/account/settings"],
  ["/merchant/settings/security", "/account/settings/security"],
  ["/merchant/settings/notifications", "/account/settings/notifications"],
  ["/merchant/settings/verification", "/account/settings"],
  ["/merchant/set-password", "/set-password"],
  ["/merchant/verify-email", "/verify-email"],
  ["/merchant/register", "/become-a-merchant"],
  ["/account/tickets", "/account/support"],
  ["/account/tickets/new", "/account/support/new"],
  // Anything else under the old portal prefix ends at the overview.
  ["/merchant/x", "/account"],
  ["/merchant/orders/42/refund", "/account"],
];

test.describe("old portal addresses", () => {
  for (const [from, to] of OLD_ADDRESSES) {
    test(`${from} answers 308 to ${to}, with and without /en, and keeps the query`, async ({ request }) => {
      const forms: [string, string][] = [
        [from, `/en${to}`],
        [`/en${from}`, `/en${to}`],
        [`${from}?token=tok`, `/en${to}?token=tok`],
        [`/en${from}?token=tok&x=1`, `/en${to}?token=tok&x=1`],
      ];
      for (const [address, expected] of forms) {
        // maxRedirects 0: the answer is the redirect itself, which comes before any sign-in check (no cookie is sent).
        const res = await request.get(address, { maxRedirects: 0 });
        expect(res.status(), address).toBe(308);
        expect(target(res.headers()["location"]), address).toBe(expected);
      }
    });
  }

  test("an old Arabic portal address takes two hops: first /en, then the account area", async ({ request }) => {
    const first = await request.get("/ar/merchant/orders/42?x=1", { maxRedirects: 0 });
    expect(first.status()).toBe(308);
    expect(target(first.headers()["location"])).toBe("/en/merchant/orders/42?x=1");
    const second = await request.get("/en/merchant/orders/42?x=1", { maxRedirects: 0 });
    expect(second.status()).toBe(308);
    expect(target(second.headers()["location"])).toBe("/en/account/orders/42?x=1");
  });

  test("an address that only starts like an old one is not moved", async ({ request }) => {
    for (const path of ["/en/merchants", "/en/merchantx/orders"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).not.toBe(308);
    }
  });
});

test.describe("old service addresses (the two rows the demo seed keeps, plan 30 §4.5 and §7.1)", () => {
  test("an old service address ends on the English page of the same service; one with no page on sale, on the list", async ({
    page,
    request,
  }) => {
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
      ["/set-password?token=xyz", "/en/set-password?token=xyz"],
      ["/verify-email?token=t", "/en/verify-email?token=t"],
      ["/become-a-merchant?from=x", "/en/become-a-merchant?from=x"],
      ["/support/tickets/t_abc", "/en/support/tickets/t_abc"],
      ["/account/orders?status=open", "/en/account/orders?status=open"],
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
  test("the account area redirects to sign-in without a session, with the page as next and no kind", async ({ request }) => {
    for (const path of ["/en/account", "/en/account/orders", "/en/account/orders?status=open", "/en/account/settings/security"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(307);
      const to = new URL(res.headers()["location"], "http://x");
      expect(to.pathname, path).toBe("/en/sign-in");
      expect(to.searchParams.get("next"), path).toBe(path);
      expect([...to.searchParams.keys()], path).toEqual(["next"]);
    }
    // The exact address the proxy writes: the path and its query, encoded once.
    const orders = await request.get("/en/account/orders", { maxRedirects: 0 });
    expect(target(orders.headers()["location"])).toBe("/en/sign-in?next=%2Fen%2Faccount%2Forders");
  });

  test("an old portal page goes to the account area before any sign-in check, never to sign-in", async ({ request }) => {
    const res = await request.get("/en/merchant/orders", { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(target(res.headers()["location"])).toBe("/en/account/orders");
  });

  test("the sign-up and email-link pages stay public", async ({ request }) => {
    for (const path of ["/en/become-a-merchant?from=x", "/en/set-password?token=t", "/en/verify-email?token=t", "/en/sign-in"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect([307, 308], path).not.toContain(res.status());
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
