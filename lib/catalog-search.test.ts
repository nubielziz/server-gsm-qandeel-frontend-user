// The search-engine half of the service list (feature 29): which pages ask the engine, their sorts, the search route's
// query, and the options built from its facet counts.
import { describe, expect, it } from "vitest";
import { toQueryString } from "@/lib/api/query";
import { SEARCH_MAX_PAGE, SEARCH_MAX_PER_PAGE, storeSearchQuery } from "@/lib/api/store-query";
import {
  NO_FILTER,
  SEARCH_SORTS,
  defaultSort,
  facetOptionsFromCounts,
  parseSort,
  searchFilterArgs,
  searchSortQuery,
  searchesEngine,
  sortsFor,
} from "./catalog-facets";

describe("which lists ask the search engine", () => {
  it("a page with a text search asks the engine (every page: English only); a blank one does not", () => {
    expect(searchesEngine("samsung")).toBe(true);
    expect(searchesEngine("  ")).toBe(false);
    expect(searchesEngine("\u0000")).toBe(false);
  });

  it("never a text the API normalises to nothing (it would answer 422)", () => {
    for (const q of ["&", "()", "😀", "&amp;", " | ; "]) expect(searchesEngine(q), q).toBe(false);
    expect(searchesEngine("AT&amp;T")).toBe(true);
  });
});

describe("sorts of a search page", () => {
  it("Best match is first and the default; Featured is not offered", () => {
    expect(SEARCH_SORTS[0]).toBe("relevance");
    expect(sortsFor(true)).not.toContain("featured");
    expect(sortsFor(false)).not.toContain("relevance");
    expect(defaultSort(true)).toBe("relevance");
    expect(defaultSort(false)).toBe("featured");
    expect(parseSort("featured", true)).toBe("relevance");
    expect(parseSort("relevance", false)).toBe("featured");
    expect(parseSort("price_desc", true)).toBe("price_desc");
  });

  it("maps to the search route's `sort` and `order`; best match sends nothing", () => {
    expect(searchSortQuery("relevance")).toEqual({});
    expect(searchSortQuery("popular")).toEqual({ sort: "popular" });
    expect(searchSortQuery("newest")).toEqual({ sort: "listedAt", order: "desc" });
    expect(searchSortQuery("price_asc")).toEqual({ sort: "price", order: "asc" });
    expect(searchSortQuery("title")).toEqual({ sort: "title", order: "asc" });
  });
});

describe("storeSearchQuery", () => {
  it("sends q, the currency and the page size; page 1 and best match stay out", () => {
    expect(storeSearchQuery({ q: " samsung frp ", currency: "USD" })).toEqual({ q: "samsung frp", currency: "USD", perPage: 24 });
  });

  it("uses page/perPage and sort/order (not _start/_end, _sort/_order), never `locale`", () => {
    const text = toQueryString(storeSearchQuery({ q: "unlock", currency: "EUR", page: 3, perPage: 24, sort: "price", order: "desc" }));
    expect(text).toBe("?q=unlock&currency=EUR&page=3&perPage=24&sort=price&order=desc");
    expect(text).not.toMatch(/_start|_end|_sort|_order|locale/);
  });

  it("keeps paging inside the route's limits", () => {
    expect(storeSearchQuery({ q: "x", currency: "USD", page: 999, perPage: 999 })).toMatchObject({ page: SEARCH_MAX_PAGE, perPage: SEARCH_MAX_PER_PAGE });
    expect(storeSearchQuery({ q: "x", currency: "USD", page: -1, perPage: 0 })).toMatchObject({ perPage: 1 });
    expect(storeSearchQuery({ q: "x", currency: "USD", page: Number.NaN })).not.toHaveProperty("page");
  });

  it("sends no order for best sellers, and cuts the text at 100 characters", () => {
    expect(storeSearchQuery({ q: "x", currency: "USD", sort: "popular", order: "asc" })).not.toHaveProperty("order");
    expect(String(storeSearchQuery({ q: "y".repeat(150), currency: "USD" }).q)).toHaveLength(100);
  });

  it("sends the filters as repeated keys and nothing empty (the route answers 422 to an unknown or empty key)", () => {
    const args = searchFilterArgs({ ...NO_FILTER, q: "unlock", brand: ["Samsung", " "], country: ["GB"], category: [4], inStock: true, type: ["imei"], max: 20 });
    const text = toQueryString(storeSearchQuery({ q: "unlock", currency: "USD", ...args }));
    expect(text).toBe("?q=unlock&currency=USD&perPage=24&brand=Samsung&country=GB&categoryId=4&type=imei&availability=in_stock&maxPrice=20");
  });
});

describe("facetOptionsFromCounts", () => {
  it("most first, then by name; selected values are marked without case and kept with 0 when missing", () => {
    const options = facetOptionsFromCounts(
      [
        { value: "Apple", count: 2 },
        { value: "Samsung", count: 5 },
        { value: "Xiaomi", count: 2 },
        { value: "", count: 9 },
        { value: "Zero", count: 0 },
      ],
      ["samsung", "Nokia"],
    );
    expect(options).toEqual([
      { value: "Samsung", count: 5, selected: true },
      { value: "Apple", count: 2, selected: false },
      { value: "Xiaomi", count: 2, selected: false },
      { value: "Nokia", count: 0, selected: true },
    ]);
  });

  it("adds up two spellings of one value", () => {
    expect(facetOptionsFromCounts([{ value: "Samsung", count: 2 }, { value: "SAMSUNG", count: 3 }], [])).toEqual([{ value: "Samsung", count: 5, selected: false }]);
  });
});
