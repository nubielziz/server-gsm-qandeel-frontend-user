import { describe, expect, it } from "vitest";
import type { StoreServiceCard } from "@/lib/api/types";
import {
  NO_FILTER,
  facetOptions,
  filterRows,
  fitPriceRange,
  matchesQuery,
  pickCollections,
  priceBounds,
  sortRows,
  type ListFilter,
} from "./catalog-facets";

let nextId = 1;
function card(fields: Partial<StoreServiceCard> & { gross?: string }): StoreServiceCard {
  const { gross = "10.0000", ...rest } = fields;
  return {
    id: nextId++,
    slug: `s-${nextId}`,
    locale: "en",
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

const rows = [
  card({ title: "iCloud Clean Check", brand: "Apple", gross: "3.9900" }),
  card({ title: "AT&T Premier Unlock", brand: "Apple", network: "AT&T", country: "US", gross: "25.9900" }),
  card({ title: "T-Mobile Unlock", brand: "Apple", network: "T-Mobile", country: "US", gross: "19.9900" }),
  card({ title: "EE UK Unlock", brand: "Apple", network: "EE", country: "GB", gross: "12.9900" }),
  card({ title: "Samsung KG Fix", brand: "Samsung", gross: "14.9900" }),
  card({ title: "Samsung Info", brand: "samsung", summary: "Region and FRP", gross: "3.9900" }),
  card({ title: "Blacklist Status", gross: "3.9900" }),
  card({ title: "Z3X Credits", type: "server", gross: "40.0000" }),
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
});

describe("sortRows", () => {
  it("keeps the catalog order for featured and sorts by name otherwise", () => {
    expect(sortRows(rows, "featured", "en")).toBe(rows);
    expect(sortRows(rows, "title", "en")[0].title).toBe("AT&T Premier Unlock");
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
