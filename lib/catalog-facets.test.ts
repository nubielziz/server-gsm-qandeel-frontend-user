import { describe, expect, it } from "vitest";
import { toQueryString } from "@/lib/api/query";
import { storeServicesQuery } from "@/lib/api/store-query";
import type { StoreServiceCard } from "@/lib/api/types";
import {
  LIST_SORTS,
  MAX_PAGE,
  NO_FILTER,
  categoryId,
  clampPage,
  cleanText,
  facetOptions,
  filterRows,
  fitPriceRange,
  inStockCount,
  listFilterArgs,
  matchesQuery,
  pageCount,
  parseSort,
  pickCollections,
  priceBounds,
  priceParam,
  requestedPage,
  resolveCategories,
  sortQuery,
  type CategoryRef,
  type ListFilter,
} from "./catalog-facets";

let nextId = 1;
function card(fields: Partial<StoreServiceCard> & { gross?: string }): StoreServiceCard {
  const { gross = "10.0000", ...rest } = fields;
  return {
    id: nextId++,
    slug: `s-${nextId}`,
    title: "Service",
    summary: "",
    brand: "",
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
    ...rest,
  };
}

const filter = (fields: Partial<ListFilter>): ListFilter => ({ ...NO_FILTER, ...fields });

const CATEGORIES: CategoryRef[] = [
  { id: 1, slug: "1-apple", name: "Apple" },
  { id: 2, slug: "2-samsung", name: "Samsung" },
  { id: 4, slug: "4-carrier-unlock", name: "Carrier unlock" },
];
const inCategory = (id: number) => ({ category: CATEGORIES.find((c) => c.id === id) ?? { id, slug: `${id}-other`, name: "Other" } });

const rows = [
  card({ title: "iCloud Clean Check", brand: "Apple", gross: "3.9900", ...inCategory(1) }),
  card({ title: "AT&T Premier Unlock", brand: "Apple", network: "AT&T", country: "US", gross: "25.9900", ...inCategory(4) }),
  card({ title: "T-Mobile Unlock", brand: "Apple", network: "T-Mobile", country: "US", gross: "19.9900", ...inCategory(4) }),
  card({ title: "EE UK Unlock", brand: "Apple", network: "EE", country: "GB", gross: "12.9900", ...inCategory(4) }),
  card({ title: "Samsung KG Fix", brand: "Samsung", gross: "14.9900", ...inCategory(2) }),
  card({ title: "Samsung Info", brand: "samsung", summary: "Region and FRP", gross: "3.9900", ...inCategory(2) }),
  card({ title: "Blacklist Status", gross: "3.9900", availability: "in_stock", ...inCategory(3) }),
  card({ title: "Z3X Credits", type: "server", gross: "40.0000", ...inCategory(3) }),
];

describe("matchesQuery", () => {
  it("is a case-insensitive contains over title, summary, brand and carrier", () => {
    expect(matchesQuery(rows[1], "premier")).toBe(true);
    expect(matchesQuery(rows[5], "frp")).toBe(true);
    expect(matchesQuery(rows[1], "at&t")).toBe(true);
    expect(matchesQuery(rows[0], "  ")).toBe(true);
    expect(matchesQuery(rows[0], "samsung")).toBe(false);
  });
});

describe("filterRows", () => {
  it("matches any value of one field and every field together", () => {
    expect(filterRows(rows, filter({ brand: ["samsung"] })).map((r) => r.title)).toEqual(["Samsung KG Fix", "Samsung Info"]);
    expect(filterRows(rows, filter({ network: ["EE", "at&t"] })).map((r) => r.title)).toEqual(["AT&T Premier Unlock", "EE UK Unlock"]);
    expect(filterRows(rows, filter({ brand: ["Apple"], country: ["US"], q: "mobile" })).map((r) => r.title)).toEqual(["T-Mobile Unlock"]);
    expect(filterRows(rows, filter({ type: ["server"] })).map((r) => r.title)).toEqual(["Z3X Credits"]);
  });

  it("keeps prices inside the range, both ends included", () => {
    expect(filterRows(rows, filter({ min: 13, max: 20 })).map((r) => r.title)).toEqual(["T-Mobile Unlock", "Samsung KG Fix"]);
    expect(filterRows(rows, filter({ max: 3 }))).toEqual([]);
    expect(filterRows(rows, filter({ min: 40 })).map((r) => r.title)).toEqual(["Z3X Credits"]);
  });

  it("keeps the services of any selected category, next to the other filters", () => {
    expect(filterRows(rows, filter({ category: [2] })).map((r) => r.title)).toEqual(["Samsung KG Fix", "Samsung Info"]);
    expect(filterRows(rows, filter({ category: [1, 2] }))).toHaveLength(3);
    expect(filterRows(rows, filter({ category: [4], country: ["US"] })).map((r) => r.title)).toEqual(["AT&T Premier Unlock", "T-Mobile Unlock"]);
    expect(filterRows(rows, filter({ category: [99] }))).toEqual([]);
  });

  it("keeps only the services that are in stock when asked", () => {
    expect(filterRows(rows, filter({ inStock: true })).map((r) => r.title)).toEqual(["Blacklist Status"]);
    expect(filterRows(rows, filter({ inStock: true, category: [1] }))).toEqual([]);
    expect(filterRows(rows, filter({ inStock: false }))).toHaveLength(rows.length);
  });
});

describe("sorts", () => {
  it("knows six sorts and takes anything else for the default", () => {
    expect(LIST_SORTS).toEqual(["featured", "popular", "newest", "price_asc", "price_desc", "title"]);
    expect(parseSort("popular")).toBe("popular");
    expect(parseSort("price_desc")).toBe("price_desc");
    for (const unknown of ["", "Popular", "price", "listedAt", "name; drop"]) expect(parseSort(unknown)).toBe("featured");
  });

  it("maps each sort to the API's `_sort` and `_order`", () => {
    expect(sortQuery("featured")).toEqual({});
    expect(sortQuery("popular")).toEqual({ sort: "popular", order: "desc" });
    expect(sortQuery("newest")).toEqual({ sort: "listedAt", order: "desc" });
    expect(sortQuery("price_asc")).toEqual({ sort: "price", order: "asc" });
    expect(sortQuery("price_desc")).toEqual({ sort: "price", order: "desc" });
    expect(sortQuery("title")).toEqual({ sort: "title", order: "asc" });
  });

  it("reaches the query as best sellers and new arrivals do in the handoff (BH §2.8); featured sends no sort", () => {
    const base = { currency: "USD" } as const;
    expect(toQueryString(storeServicesQuery({ ...base, ...sortQuery("popular") }))).toContain("_sort=popular&_order=desc");
    expect(toQueryString(storeServicesQuery({ ...base, ...sortQuery("newest") }))).toContain("_sort=listedAt&_order=desc");
    expect(toQueryString(storeServicesQuery({ ...base, ...sortQuery("price_desc") }))).toContain("_sort=price&_order=desc");
    expect(toQueryString(storeServicesQuery({ ...base, ...sortQuery("featured") }))).not.toContain("_sort");
  });
});

describe("facetOptions", () => {
  it("counts each value (case-insensitively merged), most first, then by name", () => {
    expect(facetOptions(rows, NO_FILTER, "brand")).toEqual([
      { value: "Apple", count: 4, selected: false },
      { value: "Samsung", count: 2, selected: false },
    ]);
    expect(facetOptions(rows, NO_FILTER, "type")).toEqual([
      { value: "imei", count: 7, selected: false },
      { value: "server", count: 1, selected: false },
    ]);
  });

  it("narrows the counts by the other filters (price and search included), not by the field's own selection", () => {
    const active = filter({ brand: ["apple"], country: ["US"] });
    expect(facetOptions(rows, active, "brand")).toEqual([{ value: "Apple", count: 2, selected: true }]);
    expect(facetOptions(rows, active, "network").map((o) => o.value)).toEqual(["AT&T", "T-Mobile"]);
    expect(facetOptions(rows, active, "country")).toEqual([
      { value: "US", count: 2, selected: true },
      { value: "GB", count: 1, selected: false },
    ]);
    expect(facetOptions(rows, filter({ q: "unlock" }), "brand")).toEqual([{ value: "Apple", count: 3, selected: false }]);
    // Under $5 only the row spelled "samsung" is left: an option keeps the catalog's spelling.
    expect(facetOptions(rows, filter({ max: 5 }), "brand")).toEqual([
      { value: "Apple", count: 1, selected: false },
      { value: "samsung", count: 1, selected: false },
    ]);
  });

  it("keeps a selected value that matches nothing, with a count of 0", () => {
    expect(facetOptions(rows, filter({ brand: ["Nokia"] }), "brand").at(-1)).toEqual({ value: "Nokia", count: 0, selected: true });
  });

  it("narrows the counts by a selected category and by the stock filter", () => {
    expect(facetOptions(rows, filter({ category: [4] }), "brand")).toEqual([{ value: "Apple", count: 3, selected: false }]);
    expect(facetOptions(rows, filter({ category: [4] }), "country")).toEqual([
      { value: "US", count: 2, selected: false },
      { value: "GB", count: 1, selected: false },
    ]);
    expect(facetOptions(rows, filter({ category: [2] }), "type")).toEqual([{ value: "imei", count: 2, selected: false }]);
    expect(facetOptions(rows, filter({ inStock: true }), "type")).toEqual([{ value: "imei", count: 1, selected: false }]);
  });
});

describe("inStockCount", () => {
  it("counts the services that are in stock (never stock levels)", () => {
    expect(inStockCount(rows, NO_FILTER)).toBe(1);
  });

  it("follows the other filters: a category, the price range, the search and a type", () => {
    expect(inStockCount(rows, filter({ category: [3] }))).toBe(1);
    expect(inStockCount(rows, filter({ category: [1, 2] }))).toBe(0);
    expect(inStockCount(rows, filter({ min: 10 }))).toBe(0);
    expect(inStockCount(rows, filter({ q: "blacklist" }))).toBe(1);
    expect(inStockCount(rows, filter({ type: ["server"] }))).toBe(0);
  });

  it("is the same number whether or not the box is ticked, and equals the list's total once it is", () => {
    const active = filter({ category: [3] });
    expect(inStockCount(rows, active)).toBe(inStockCount(rows, { ...active, inStock: true }));
    expect(inStockCount(rows, active)).toBe(filterRows(rows, { ...active, inStock: true }).length);
  });
});

describe("price range", () => {
  it("spans the catalog in whole units", () => {
    expect(priceBounds(rows)).toEqual({ min: 3, max: 40 });
    expect(priceBounds([])).toBeNull();
  });

  it("fits a range from the URL to the span", () => {
    const bounds = { min: 3, max: 40 };
    expect(fitPriceRange(5, 20, bounds)).toEqual({ min: 5, max: 20 });
    expect(fitPriceRange(3, 40, bounds)).toEqual({ min: null, max: null });
    expect(fitPriceRange(0, 99, bounds)).toEqual({ min: null, max: null });
    expect(fitPriceRange(30, 10, bounds)).toEqual({ min: 10, max: 30 });
    expect(fitPriceRange(5, 20, null)).toEqual({ min: null, max: null });
  });

  it("turns a reversed range round before the API sees it (it answers 422 on maxPrice), then fits it", () => {
    const bounds = { min: 3, max: 40 };
    const { min, max } = fitPriceRange(20, 10, bounds);
    expect([min, max]).toEqual([10, 20]);
    // Reversed and wider than the catalog: no limit at all, not "3 to 40".
    expect(fitPriceRange(50, 2, bounds)).toEqual({ min: null, max: null });
    expect(fitPriceRange(99, 1, bounds)).toEqual({ min: null, max: null });
  });

  it("holds each end inside the span and keeps one-sided ranges", () => {
    const bounds = { min: 3, max: 40 };
    expect(fitPriceRange(10, null, bounds)).toEqual({ min: 10, max: null });
    expect(fitPriceRange(null, 10, bounds)).toEqual({ min: null, max: 10 });
    expect(fitPriceRange(null, 1, bounds)).toEqual({ min: null, max: 3 });
    expect(fitPriceRange(45, null, bounds)).toEqual({ min: 40, max: null });
    expect(fitPriceRange(10, 10, bounds)).toEqual({ min: 10, max: 10 });
  });

  it("sends a bound the API accepts (whole, at most 12 digits) and leaves out anything else", () => {
    expect(priceParam(0)).toBe("0");
    expect(priceParam(26)).toBe("26");
    expect(priceParam(999_999_999_999)).toBe("999999999999");
    expect(priceParam(1_000_000_000_000)).toBeUndefined();
    expect(priceParam(null)).toBeUndefined();
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1e21]) expect(priceParam(bad)).toBeUndefined();
    expect(priceParam(26)).toMatch(/^\d{1,12}(\.\d{1,4})?$/);
  });
});

describe("categories", () => {
  it("reads the id as the number before the first hyphen", () => {
    expect(categoryId("4-carrier-unlock")).toBe(4);
    expect(categoryId("12")).toBe(12);
    expect(categoryId(" 7-apple ")).toBe(7);
    for (const none of ["", "carrier-unlock", "-4", "0-x", "x4-y", "4x", "1.5", "9999999999-x"]) expect(categoryId(none)).toBeNull();
  });

  it("resolves a listed category to the API's own slug and name, by id whatever the rest says", () => {
    const { entries, ids } = resolveCategories(["4", "2-old-name"], CATEGORIES);
    expect(entries).toEqual([
      { value: "4-carrier-unlock", id: 4, label: "Carrier unlock", known: true },
      { value: "2-samsung", id: 2, label: "Samsung", known: true },
    ]);
    expect(ids).toEqual([4, 2]);
  });

  it("counts the same category once, however it is spelled", () => {
    const { entries, ids } = resolveCategories(["4-carrier-unlock", "4", "4-whatever", "1-apple"], CATEGORIES);
    expect(entries.map((entry) => entry.value)).toEqual(["4-carrier-unlock", "1-apple"]);
    expect(ids).toEqual([4, 1]);
  });

  it("ignores an unlisted category (not sent to the API) but keeps a removable entry for it", () => {
    const { entries, ids } = resolveCategories(["99-old-phones", "zz", "1-apple"], CATEGORIES);
    expect(ids).toEqual([1]);
    expect(entries).toEqual([
      { value: "99-old-phones", id: 99, label: "old phones", known: false },
      { value: "zz", id: null, label: "zz", known: false },
      { value: "1-apple", id: 1, label: "Apple", known: true },
    ]);
    expect(resolveCategories(["99"], CATEGORIES).entries[0]?.label).toBe("99");
    expect(resolveCategories(["99-x"], []).ids).toEqual([]);
  });
});

describe("listFilterArgs", () => {
  it("is empty for no filter, so the request carries nothing but the currency and page", () => {
    expect(listFilterArgs(NO_FILTER)).toEqual({});
    const query = storeServicesQuery({ currency: "USD", ...listFilterArgs(NO_FILTER), start: 0, end: 24 });
    expect(query).toStrictEqual({ _start: 0, _end: 24, currency: "USD" });
  });

  it("carries every filter of the list: category ids, stock, type, brand, carrier, country, price range, search", () => {
    const args = listFilterArgs(
      filter({ q: " unlock ", category: [4, 1], inStock: true, type: ["imei"], brand: ["Samsung", "Apple"], network: ["EE"], country: ["US", "GB"], min: 5, max: 20 }),
    );
    expect(args).toEqual({
      q: "unlock",
      categoryId: [1, 4],
      availability: "in_stock",
      type: ["imei"],
      brand: ["Apple", "Samsung"],
      network: ["EE"],
      country: ["GB", "US"],
      minPrice: "5",
      maxPrice: "20",
    });
    const text = toQueryString(storeServicesQuery({ currency: "JOD", ...args }));
    expect(text).toContain("categoryId=1&categoryId=4");
    expect(text).toContain("availability=in_stock");
    expect(text).toContain("brand=Apple&brand=Samsung");
    expect(text).toContain("minPrice=5&maxPrice=20");
    expect(text).toContain("currency=JOD");
  });

  it("sends the same request for every order of the same filter (one cache entry)", () => {
    const a = listFilterArgs(filter({ brand: ["B", "A"], country: ["US", "GB"], category: [4, 1] }));
    const b = listFilterArgs(filter({ brand: ["A", "B"], country: ["GB", "US"], category: [1, 4] }));
    expect(a).toEqual(b);
  });

  it("drops what the API would answer 422 or 500 to: unknown types, malformed bounds, control characters, empty text", () => {
    const args = listFilterArgs(
      filter({ q: "\u0000 ", type: ["bogus", "file"], brand: ["\u0000", "Ap\u0000ple", "  "], network: ["\u0000x"], country: [], min: 1.5, max: 1e21 }),
    );
    expect(args).toEqual({ type: ["file"], brand: ["Apple"], network: ["x"] });
    expect(JSON.stringify(args)).not.toContain("\\u0000");
  });

  it("never sends a reversed range once it is fitted", () => {
    const fitted = fitPriceRange(30, 10, { min: 3, max: 40 });
    const args = listFilterArgs(filter(fitted));
    expect(Number(args.minPrice)).toBeLessThanOrEqual(Number(args.maxPrice));
  });
});

describe("cleanText", () => {
  it("removes control characters (the API answers 500 to a NUL byte) and trims", () => {
    expect(cleanText("  Apple ")).toBe("Apple");
    expect(cleanText("a\u0000b\tc\nd\u007f")).toBe("abcd");
    expect(cleanText("\u0000")).toBe("");
    expect(cleanText("فحص iCloud")).toBe("فحص iCloud");
  });
});

describe("paging", () => {
  it("reads a page number as a whole number from 1 to the cap", () => {
    expect(requestedPage(3)).toBe(3);
    expect(requestedPage(2.9)).toBe(2);
    for (const bad of [0, -4, Number.NaN, Number.NEGATIVE_INFINITY]) expect(requestedPage(bad)).toBe(1);
    expect(requestedPage(1e21)).toBe(MAX_PAGE);
    expect(requestedPage(Number.POSITIVE_INFINITY)).toBe(1);
    // 24 a page at the cap stays far below the API's `_start` limit of 10 000 000.
    expect((MAX_PAGE - 1) * 100).toBeLessThan(10_000_000);
  });

  it("counts pages, and an empty list is still page 1", () => {
    expect(pageCount(0, 24)).toBe(1);
    expect(pageCount(24, 24)).toBe(1);
    expect(pageCount(25, 24)).toBe(2);
    expect(pageCount(11, 8)).toBe(2);
    expect(pageCount(5, 0)).toBe(5);
  });

  it("turns a page past the end into the last page", () => {
    expect(clampPage(2, 11, 8)).toBe(2);
    expect(clampPage(3, 11, 8)).toBe(2);
    expect(clampPage(999, 11, 8)).toBe(2);
    expect(clampPage(5, 0, 8)).toBe(1);
    expect(clampPage(-1, 11, 8)).toBe(1);
    expect(clampPage(1e21, 100, 24)).toBe(5);
  });
});

describe("pickCollections", () => {
  it("takes the biggest groups (2 services or more) with their lowest price, brands first on a tie", () => {
    const picked = pickCollections(rows);
    expect(picked.map((c) => [c.kind, c.value, c.count, c.from.gross])).toEqual([
      ["brand", "Apple", 4, "3.9900"],
      ["brand", "Samsung", 2, "3.9900"],
      ["country", "US", 2, "19.9900"],
    ]);
  });

  it("takes at most `perKind` of one kind and at most `limit` in all", () => {
    const many = [
      ...["Apple", "Apple", "Apple", "Samsung", "Samsung", "Xiaomi", "Xiaomi"].map((brand) => card({ brand })),
      card({ brand: "Apple", country: "US" }),
      card({ brand: "Apple", country: "US" }),
    ];
    expect(pickCollections(many).map((c) => c.value)).toEqual(["Apple", "Samsung", "US"]);
    expect(pickCollections(many, { perKind: 3 }).map((c) => c.value)).toEqual(["Apple", "Samsung", "Xiaomi"]);
    expect(pickCollections(many, { limit: 1 }).map((c) => c.value)).toEqual(["Apple"]);
  });

  it("returns nothing when no group has two services", () => {
    expect(pickCollections([card({ brand: "Apple" }), card({ brand: "Samsung" })])).toEqual([]);
  });
});
