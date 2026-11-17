import { describe, expect, it } from "vitest";
import { toQueryString } from "./query";
import { defaultOrder, pageWindow, storeServicesQuery } from "./store-query";

const base = { currency: "USD" } as const;

describe("storeServicesQuery", () => {
  it("sends the currency and the default page, and nothing else (no language: English only)", () => {
    expect(storeServicesQuery(base)).toStrictEqual({ _start: 0, _end: 24, currency: "USD" });
    expect(toQueryString(storeServicesQuery(base))).toBe("?_start=0&_end=24&currency=USD");
  });

  it("repeats the key of an array (the API reads a repeated key as IN)", () => {
    const query = storeServicesQuery({
      ...base,
      type: ["imei", "server"],
      categoryId: [4, 7],
      brand: ["Apple", "Samsung"],
      network: "EE",
      country: ["GB", "US"],
      availability: ["in_stock", "on_request"],
    });
    expect(query).toMatchObject({
      type: ["imei", "server"],
      categoryId: ["4", "7"],
      brand: ["Apple", "Samsung"],
      network: ["EE"],
      country: ["GB", "US"],
      availability: ["in_stock", "on_request"],
    });
    const text = toQueryString(query);
    expect(text).toContain("type=imei&type=server");
    expect(text).toContain("categoryId=4&categoryId=7");
    expect(text).toContain("brand=Apple&brand=Samsung");
    expect(text).toContain("availability=in_stock&availability=on_request");
  });

  it("takes one value where the filter allows one", () => {
    const query = storeServicesQuery({ ...base, availability: "in_stock", brand: "Apple" });
    expect(query.availability).toEqual(["in_stock"]);
    expect(query.brand).toEqual(["Apple"]);
  });

  it("leaves out empty strings, empty arrays and undefined (a list route answers 422 to anything unknown or malformed)", () => {
    const query = storeServicesQuery({
      ...base,
      q: "   ",
      brand: "",
      network: ["", "  "],
      country: [],
      type: [],
      categoryId: [],
      availability: [],
      minPrice: "",
      maxPrice: "  ",
      buyerCountry: "",
    });
    expect(query).toStrictEqual({ _start: 0, _end: 24, currency: "USD" });
    for (const key of ["q", "brand", "network", "country", "type", "categoryId", "availability", "minPrice", "maxPrice", "buyerCountry", "_sort", "_order"]) {
      expect(query).not.toHaveProperty(key);
    }
  });

  it("trims the search text and keeps a `featured: false` filter", () => {
    const query = storeServicesQuery({ ...base, q: "  iphone ", featured: false });
    expect(query.q).toBe("iphone");
    expect(toQueryString(query)).toContain("featured=false");
    expect(toQueryString(storeServicesQuery({ ...base, featured: true }))).toContain("featured=true");
  });

  it("keeps only numeric category ids (the API answers 422 to anything else)", () => {
    expect(storeServicesQuery({ ...base, categoryId: [4, Number.NaN, 0, -2, 1.5, 9] }).categoryId).toEqual(["4", "9"]);
    expect(storeServicesQuery({ ...base, categoryId: [Number.NaN] })).not.toHaveProperty("categoryId");
  });

  it("sends the price bounds as given, and the buyer's country", () => {
    const query = storeServicesQuery({ ...base, minPrice: " 5.0000 ", maxPrice: "100", buyerCountry: "JO" });
    expect(query).toMatchObject({ minPrice: "5.0000", maxPrice: "100", buyerCountry: "JO" });
  });

  it("sends no sort and no order when no sort is asked for (the API's own order applies)", () => {
    expect(storeServicesQuery({ ...base, order: "asc" })).not.toHaveProperty("_order");
    expect(storeServicesQuery(base)).not.toHaveProperty("_sort");
  });

  it("orders descending by default for featured, popular and listedAt, ascending for the rest", () => {
    expect(storeServicesQuery({ ...base, sort: "featured" })).toMatchObject({ _sort: "featured", _order: "desc" });
    expect(storeServicesQuery({ ...base, sort: "popular" })).toMatchObject({ _sort: "popular", _order: "desc" });
    expect(storeServicesQuery({ ...base, sort: "listedAt" })).toMatchObject({ _sort: "listedAt", _order: "desc" });
    expect(storeServicesQuery({ ...base, sort: "price" })).toMatchObject({ _sort: "price", _order: "asc" });
    expect(storeServicesQuery({ ...base, sort: "title" })).toMatchObject({ _sort: "title", _order: "asc" });
    expect(storeServicesQuery({ ...base, sort: "sort" })).toMatchObject({ _sort: "sort", _order: "asc" });
    expect(defaultOrder("popular")).toBe("desc");
    expect(defaultOrder("price")).toBe("asc");
  });

  it("lets the caller override the default order", () => {
    expect(storeServicesQuery({ ...base, sort: "price", order: "desc" })).toMatchObject({ _sort: "price", _order: "desc" });
    expect(storeServicesQuery({ ...base, sort: "popular", order: "asc" })).toMatchObject({ _sort: "popular", _order: "asc" });
  });

  it("pages: default 24 rows, at most 100 per page", () => {
    expect(storeServicesQuery({ ...base, start: 24, end: 48 })).toMatchObject({ _start: 24, _end: 48 });
    expect(storeServicesQuery({ ...base, start: 0, end: 500 })).toMatchObject({ _start: 0, _end: 100 });
    expect(storeServicesQuery({ ...base, start: 200, end: 1000 })).toMatchObject({ _start: 200, _end: 300 });
    expect(storeServicesQuery({ ...base, start: 10 })).toMatchObject({ _start: 10, _end: 34 });
    expect(storeServicesQuery({ ...base, start: -5 })).toMatchObject({ _start: 0 });
  });

  it("keeps end above start, so the API never answers 422 on _end", () => {
    expect(storeServicesQuery({ ...base, start: 48, end: 24 })).toMatchObject({ _start: 48, _end: 49 });
    expect(storeServicesQuery({ ...base, start: 24, end: 24 })).toMatchObject({ _start: 24, _end: 25 });
    expect(storeServicesQuery({ ...base, start: Number.NaN })).toMatchObject({ _start: 0, _end: 24 });
    expect(storeServicesQuery({ ...base, end: Number.NaN })).toMatchObject({ _start: 0, _end: 24 });
    expect(storeServicesQuery({ ...base, start: 5, end: Number.POSITIVE_INFINITY })).toMatchObject({ _start: 5, _end: 29 });
  });

  it("pageWindow: the same window for any list route (default size, floor, bounds)", () => {
    expect(pageWindow({}, 100)).toStrictEqual({ start: 0, end: 100 });
    expect(pageWindow({ start: 100 }, 100)).toStrictEqual({ start: 100, end: 200 });
    expect(pageWindow({ start: 10, end: 5 }, 100)).toStrictEqual({ start: 10, end: 11 });
    expect(pageWindow({ start: 0, end: 500 }, 100)).toStrictEqual({ start: 0, end: 100 });
    expect(pageWindow({ start: 1.9, end: 10.9 }, 24)).toStrictEqual({ start: 1, end: 10 });
    expect(pageWindow({ start: Number.NaN, end: Number.NaN }, 100)).toStrictEqual({ start: 0, end: 100 });
  });

  it("keeps the arguments the existing call sites send", () => {
    // app/en/(store)/page.tsx and lib/catalog.ts
    expect(storeServicesQuery({ currency: "JOD", featured: true, start: 0, end: 8 })).toStrictEqual({
      _start: 0,
      _end: 8,
      currency: "JOD",
      featured: true,
    });
    expect(storeServicesQuery({ currency: "USD", featured: false, sort: "title", start: 0, end: 12 })).toMatchObject({
      _sort: "title",
      _order: "asc",
      featured: false,
    });
  });
});
