// catalogList (lib/catalog.ts) with the API mocked: an English text the API normalises to nothing is no search (neither
// route is asked with a `q` it refuses), and the price slider keeps the catalog's span while a price bound is applied.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceListArgs, StoreSearchArgs } from "@/lib/api/store-query";
import type { SearchBody, StoreCategory, StoreServiceCard } from "@/lib/api/types";
import type { ListInput } from "./catalog-facets";

const api = vi.hoisted(() => ({
  listStoreServices: vi.fn(),
  listStoreCategories: vi.fn(),
  searchStore: vi.fn(),
  searchStoreServices: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("@/lib/api/public", () => ({ listStoreServices: api.listStoreServices, listStoreCategories: api.listStoreCategories }));
vi.mock("@/lib/api/visitor", () => ({ searchStore: api.searchStore, searchStoreServices: api.searchStoreServices }));

import { catalogList } from "./catalog";

function card(id: number, gross: string): StoreServiceCard {
  return {
    id,
    slug: `${id}-service`,
    locale: "en",
    title: `Service ${id}`,
    summary: "",
    brand: "Samsung",
    network: "",
    country: "",
    isFeatured: false,
    type: "imei",
    deliveryTime: "1 day",
    category: { id: 1, slug: "1-general", name: "General" },
    availability: "on_request",
    deliveryMinutes: 1440,
    etaText: "",
    listedAt: null,
    imageUrl: null,
    price: { currency: "USD", fxRate: "1.00000000", net: gross, tax: "0.0000", gross, taxRate: "0", taxCountry: null },
  };
}

// The catalog's span is 5 to 50.
const CATALOG = [card(1, "5.0000"), card(2, "20.0000"), card(3, "50.0000")];
const CATEGORIES = [{ id: 1, slug: "1-general", name: "General", serviceCount: 3 }] as unknown as StoreCategory[];

function searchBody(fields: Partial<SearchBody> = {}): SearchBody {
  return {
    q: "samsung",
    engine: "typesense",
    total: 1,
    truncated: false,
    page: 1,
    perPage: 24,
    hits: [CATALOG[1]],
    facets: { brand: [{ value: "Samsung", count: 1 }], network: [], country: [], category: [], type: [], availability: { in_stock: 0, on_request: 1 } },
    // Over the matches, as if it were cut to a bound of 30.
    priceRange: { min: "20.0000", max: "29.0000" },
    didYouMean: null,
    intent: null,
    ...fields,
  };
}

const input = (fields: Partial<ListInput>): ListInput => ({
  q: "",
  min: null,
  max: null,
  category: [],
  inStock: false,
  type: [],
  brand: [],
  network: [],
  country: [],
  ...fields,
});

/** The `q` of every list read (the catalog's own reads of 100 rows have none). */
const listQueries = () => api.listStoreServices.mock.calls.map((call) => (call[0] as ServiceListArgs).q);

beforeEach(() => {
  vi.clearAllMocks();
  api.listStoreServices.mockImplementation(async () => ({ data: CATALOG, total: CATALOG.length }));
  api.listStoreCategories.mockResolvedValue(CATEGORIES);
  api.searchStore.mockImplementation(async () => searchBody());
  api.searchStoreServices.mockImplementation(async () => ({ data: CATALOG, total: CATALOG.length }));
});

describe("catalogList: a text the API normalises to nothing", () => {
  for (const q of ["&", "()", "😀", "&amp;"]) {
    it(`is no search on an English page (${q})`, async () => {
      const list = await catalogList("en", "USD", input({ q }), "featured", 1, 24);
      expect(api.searchStore).not.toHaveBeenCalled();
      expect(api.searchStoreServices).not.toHaveBeenCalled();
      expect(listQueries().every((sent) => sent === undefined)).toBe(true);
      expect(list.filter.q).toBe("");
      expect(list.search).toBeNull();
    });
  }

  it("a real English search still asks the search route", async () => {
    const list = await catalogList("en", "USD", input({ q: "AT&T unlock" }), "relevance", 1, 24);
    expect(api.searchStore).toHaveBeenCalledTimes(1);
    expect((api.searchStore.mock.calls[0][0] as StoreSearchArgs).q).toBe("AT&T unlock");
    expect(list.search?.engine).toBe("typesense");
  });
});

describe("catalogList: the price slider of a search page", () => {
  it("spans the matches on page 1 without a price bound", async () => {
    const list = await catalogList("en", "USD", input({ q: "samsung" }), "relevance", 1, 24);
    expect(list.bounds).toEqual({ min: 20, max: 29 });
  });

  it("keeps the catalog's span while a price bound is applied, so the bound is not dropped", async () => {
    const upTo = await catalogList("en", "USD", input({ q: "samsung", max: 30 }), "relevance", 1, 24);
    expect(upTo.filter.max).toBe(30);
    expect(upTo.bounds).toEqual({ min: 5, max: 50 });

    const from = await catalogList("en", "USD", input({ q: "samsung", min: 10 }), "relevance", 1, 24);
    expect(from.filter.min).toBe(10);
    expect(from.bounds).toEqual({ min: 5, max: 50 });
  });

  it("uses the catalog's span when the route gives none (fallback)", async () => {
    api.searchStore.mockImplementation(async () => searchBody({ engine: "fallback", facets: null, priceRange: null }));
    const list = await catalogList("en", "USD", input({ q: "samsung" }), "relevance", 1, 24);
    expect(list.bounds).toEqual({ min: 5, max: 50 });
  });
});
