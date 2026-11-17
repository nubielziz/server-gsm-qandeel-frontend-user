// English only (decision 039, plan 30 §7.7): no read of lib/api sends a language. The list routes answer 422 to a query
// key they do not know, so a `locale` left in any of them would break a page once the API stops accepting it. Every
// exported read of ./public.ts and ./visitor.ts runs here against a stubbed `fetch`, with every argument it takes, and
// each URL it asks for is checked. Also the old-address lookup (`GET /store/v1/legacy-slugs/:kind/:slug`).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
  cookies: async () => ({ toString: () => "" }),
}));
vi.mock("next/server", () => ({ connection: async () => {} }));

import * as publicReads from "./public";
import * as visitorReads from "./visitor";
import { storeSearchQuery, storeServicesQuery } from "./store-query";
import { toQueryString } from "./query";

let urls: string[] = [];
/** What the stub answers to the next request: a status and a JSON body. */
let answer: { status: number; body: unknown } = { status: 200, body: {} };

beforeEach(() => {
  urls = [];
  answer = { status: 200, body: {} };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const body = answer.status === 404 ? { status: 404, code: "NOT_FOUND", title: "Not found" } : answer.body;
      return new Response(JSON.stringify(body), {
        status: answer.status,
        headers: { "content-type": answer.status >= 400 ? "application/problem+json" : "application/json", "x-total-count": "0" },
      });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

/** The query keys of a requested URL. */
function keysOf(url: string): string[] {
  return [...new URL(url).searchParams.keys()];
}

function expectNoLanguage(sent: readonly string[]) {
  expect(sent.length).toBeGreaterThan(0);
  for (const url of sent) {
    expect(keysOf(url), url).not.toContain("locale");
    expect(keysOf(url), url).not.toContain("locales");
    expect(url, url).not.toMatch(/[?&]locale=/);
  }
}

const EVERY_FILTER = {
  currency: "USD",
  q: "unlock",
  brand: ["Apple"],
  network: ["EE"],
  country: ["GB"],
  featured: true,
  type: ["imei" as const],
  categoryId: [4],
  availability: "in_stock" as const,
  minPrice: "5",
  maxPrice: "50",
  sort: "price" as const,
  order: "desc" as const,
  start: 24,
  end: 48,
  buyerCountry: "GB",
};

describe("no read of lib/api sends a language", () => {
  it("the query builders hold no language, with every argument they take", () => {
    for (const query of [storeServicesQuery({ currency: "USD" }), storeServicesQuery(EVERY_FILTER)]) {
      expect(Object.keys(query)).not.toContain("locale");
      expect(toQueryString(query)).not.toContain("locale");
    }
    const search = storeSearchQuery({ q: "unlock", currency: "USD", page: 2, perPage: 24, brand: "Apple", sort: "price", order: "asc" });
    expect(Object.keys(search)).not.toContain("locale");
  });

  it("the cached reads of public.ts", async () => {
    answer = { status: 200, body: { categories: [], popular: [] } };
    await publicReads.getStoreConfig();
    await publicReads.listStoreServices({ currency: "USD" });
    await publicReads.listStoreServices(EVERY_FILTER);
    await publicReads.listStoreCategories();
    await publicReads.getStoreService("icloud-clean-lost-check", { currency: "JOD", buyerCountry: "GB" });
    await publicReads.getContentPage("terms");
    await publicReads.listContentPages({ kind: ["blog", "static"], start: 0, end: 10 });
    await publicReads.listHelpArticles({ q: "imei", category: "Orders", start: 0, end: 20 });
    await publicReads.getHelpArticle("12-how-to");
    await publicReads.listPopularSearches();
    answer = { status: 200, body: { path: "/help", slug: null } };
    await publicReads.getLegacySlug("help", "7-old-article");
    await publicReads.legacyPath("page", "old-page");
    expect(urls).toHaveLength(12);
    expectNoLanguage(urls);
  });

  it("the per-visitor search", async () => {
    answer = { status: 200, body: { hits: [] } };
    await visitorReads.searchStore({ q: "unlock", currency: "USD", brand: "Apple", page: 1 });
    expectNoLanguage(urls);
  });

  it("covers every read the two files export (a new read must be added above)", () => {
    expect(Object.keys(publicReads).sort()).toEqual([
      "getContentPage",
      "getHelpArticle",
      "getLegacySlug",
      "getStoreConfig",
      "getStoreService",
      "legacyPath",
      "listContentPages",
      "listHelpArticles",
      "listPopularSearches",
      "listStoreCategories",
      "listStoreServices",
    ]);
    expect(Object.keys(visitorReads)).toEqual(["searchStore"]);
  });
});

describe("the old-address lookup (plan 30 §4.5, §7.1)", () => {
  it("asks the kind and the slug in the path, and answers the API's path and slug", async () => {
    answer = { status: 200, body: { path: "/services/icloud-clean-lost-check", slug: "icloud-clean-lost-check" } };
    expect(await publicReads.getLegacySlug("service", "legacy demo/ü")).toEqual({
      path: "/services/icloud-clean-lost-check",
      slug: "icloud-clean-lost-check",
    });
    expect(new URL(urls[0]).pathname).toBe("/store/v1/legacy-slugs/service/legacy%20demo%2F%C3%BC");
    expect(new URL(urls[0]).search).toBe("");
  });

  it("gives the path of a page or a help article", async () => {
    answer = { status: 200, body: { path: "/", slug: null } };
    expect(await publicReads.legacyPath("page", "an-old-page")).toBe("/");
    answer = { status: 200, body: { path: "/help", slug: null } };
    expect(await publicReads.legacyPath("help", "7-an-old-article")).toBe("/help");
  });

  it("is null for an address that was never retired (404)", async () => {
    answer = { status: 404, body: null };
    expect(await publicReads.getLegacySlug("service", "nope")).toBeNull();
    expect(await publicReads.legacyPath("help", "9-nope")).toBeNull();
  });

  it("never sends an empty or too long slug (the route answers 422 to it)", async () => {
    expect(await publicReads.getLegacySlug("service", "")).toBeNull();
    expect(await publicReads.getLegacySlug("page", "a".repeat(201))).toBeNull();
    expect(urls).toEqual([]);
    answer = { status: 200, body: { path: "/", slug: null } };
    expect(await publicReads.legacyPath("page", "a".repeat(200))).toBe("/");
  });

  it("refuses an answer that would lead off the site, and reads an empty slug as none", async () => {
    for (const path of ["//evil.test", "/\\evil.test", "https://evil.test/", "services", "", null]) {
      answer = { status: 200, body: { path, slug: null } };
      expect(await publicReads.getLegacySlug("service", "x"), String(path)).toBeNull();
    }
    answer = { status: 200, body: { path: "/services", slug: "" } };
    expect(await publicReads.getLegacySlug("service", "x")).toEqual({ path: "/services", slug: null });
  });
});
