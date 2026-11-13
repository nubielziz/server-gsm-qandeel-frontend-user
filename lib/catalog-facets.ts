// Faceted browsing of the listed catalog, worked out in memory over the service cards that lib/catalog.ts reads (cached):
// the home page's "All services" list (filter, sort, the option lists with how many services each option would show,
// the price range) and its "Featured collections". The API has no category, type or price filter and no facet counts
// (handoff §1.7), so the store's own groups are the card's type (shown as "Categories"), brand, carrier and country.
// The brand, carrier, country and text rules are the API's own (exact, case-insensitive; `q` over title, summary,
// brand and carrier). Pure functions: unit-tested, safe anywhere.
import type { StoreServiceCard } from "@/lib/api/types";
import { compareMoney } from "@/lib/format";

/** The card fields the home list can be filtered by; each is a query parameter that may repeat (`brand=A&brand=B`). */
export const FACET_KEYS = ["type", "brand", "network", "country"] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

/**
 * Active filters. Several values of one field match any of them; different fields must all match. `min` and `max` are
 * whole units of the rows' currency (the visitor's), null for "no limit".
 */
export type ListFilter = { q: string; min: number | null; max: number | null } & Record<FacetKey, string[]>;

export const NO_FILTER: ListFilter = { q: "", min: null, max: null, type: [], brand: [], network: [], country: [] };

export type FacetOption = {
  /** The value as the catalog spells it (sent back as the query parameter). */
  value: string;
  /** How many services the list would show with this option and the other active filters. */
  count: number;
  selected: boolean;
};

export type ListSort = "featured" | "title";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const units = (n: number) => `${n}.0000`;

/** The API's text search (handoff §5 #2): a case-insensitive "contains" over the title, summary, brand and carrier. */
export function matchesQuery(row: StoreServiceCard, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [row.title, row.summary, row.brand, row.network].some((field) => field.toLowerCase().includes(needle));
}

/** Whether the card's price (what it shows: no tax) is inside the range. */
function inPriceRange(row: StoreServiceCard, filter: ListFilter): boolean {
  if (filter.min !== null && compareMoney(row.price.gross, units(filter.min)) < 0) return false;
  if (filter.max !== null && compareMoney(row.price.gross, units(filter.max)) > 0) return false;
  return true;
}

/** Whether a card passes the filter, leaving one field out (the options of a field must not be narrowed by itself). */
function passes(row: StoreServiceCard, filter: ListFilter, except?: FacetKey): boolean {
  if (!matchesQuery(row, filter.q) || !inPriceRange(row, filter)) return false;
  return FACET_KEYS.every((key) => key === except || filter[key].length === 0 || filter[key].some((value) => same(row[key], value)));
}

/** The cards that pass every active filter, in their order. */
export function filterRows(rows: StoreServiceCard[], filter: ListFilter): StoreServiceCard[] {
  return rows.filter((row) => passes(row, filter));
}

/** `featured` keeps the catalog's order (the API's default: featured first); `title` sorts by name in the language. */
export function sortRows(rows: StoreServiceCard[], sort: ListSort, locale: string): StoreServiceCard[] {
  return sort === "title" ? [...rows].sort((a, b) => a.title.localeCompare(b.title, locale)) : rows;
}

/**
 * The options of one field with how many services each would show next to the other active filters (the price range
 * and the search included): most first, then by name. Options that would show nothing are left out, except selected
 * ones (a typed or outdated link).
 */
export function facetOptions(rows: StoreServiceCard[], filter: ListFilter, key: FacetKey): FacetOption[] {
  const counts = new Map<string, { value: string; count: number }>();
  for (const row of rows) {
    const value = row[key];
    if (!value || !passes(row, filter, key)) continue;
    const id = value.toLowerCase();
    const entry = counts.get(id);
    if (entry) entry.count += 1;
    else counts.set(id, { value, count: 1 });
  }
  const options = [...counts.values()].map(({ value, count }) => ({
    value,
    count,
    selected: filter[key].some((selected) => same(value, selected)),
  }));
  for (const selected of filter[key]) {
    if (!options.some((option) => same(option.value, selected))) options.push({ value: selected, count: 0, selected: true });
  }
  return options.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** The whole units the price slider spans: the lowest card price rounded down to the highest rounded up. */
export function priceBounds(rows: StoreServiceCard[]): { min: number; max: number } | null {
  if (rows.length === 0) return null;
  let low = Infinity;
  let high = -Infinity;
  for (const row of rows) {
    const price = Number(row.price.gross);
    if (price < low) low = price;
    if (price > high) high = price;
  }
  return { min: Math.floor(low), max: Math.ceil(high) };
}

/**
 * A price range from the URL, fitted to the slider: limits outside the catalog's span (or at its ends) mean "no
 * limit", and a reversed range is turned round.
 */
export function fitPriceRange(min: number | null, max: number | null, bounds: { min: number; max: number } | null): { min: number | null; max: number | null } {
  if (!bounds) return { min: null, max: null };
  let low = min !== null && min > bounds.min ? Math.min(min, bounds.max) : null;
  let high = max !== null && max < bounds.max ? Math.max(max, bounds.min) : null;
  if (low !== null && high !== null && low > high) [low, high] = [high, low];
  return { min: low, max: high };
}

export type CollectionKind = Exclude<FacetKey, "type">;

export type Collection = {
  kind: CollectionKind;
  /** The brand or carrier name, or the ISO country code. */
  value: string;
  count: number;
  /** The lowest card price of the group (in the rows' currency, no tax). */
  from: StoreServiceCard["price"];
};

/** Brands first, then countries, then carriers when groups are the same size. */
const KIND_ORDER: readonly CollectionKind[] = ["brand", "country", "network"];

export type CollectionOptions = {
  /** How many collections at most (default 3). */
  limit?: number;
  /** How many of one kind at most (default 2), so the row mixes brands, countries and carriers. */
  perKind?: number;
  /** The smallest group that makes a collection (default 2 services). */
  min?: number;
};

/** The featured collections: the brands, countries and carriers with the most services, each with its lowest price. */
export function pickCollections(rows: StoreServiceCard[], { limit = 3, perKind = 2, min = 2 }: CollectionOptions = {}): Collection[] {
  const groups = new Map<string, Collection>();
  for (const row of rows) {
    for (const kind of KIND_ORDER) {
      const value = row[kind];
      if (!value) continue;
      const id = `${kind}:${value.toLowerCase()}`;
      const group = groups.get(id);
      if (!group) groups.set(id, { kind, value, count: 1, from: row.price });
      else {
        group.count += 1;
        if (compareMoney(row.price.gross, group.from.gross) < 0) group.from = row.price;
      }
    }
  }
  const ranked = [...groups.values()]
    .filter((group) => group.count >= min)
    .sort(
      (a, b) =>
        b.count - a.count || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.value.localeCompare(b.value),
    );
  const picked: Collection[] = [];
  const taken = new Map<CollectionKind, number>();
  for (const group of ranked) {
    if (picked.length >= limit) break;
    const n = taken.get(group.kind) ?? 0;
    if (n >= perKind) continue;
    taken.set(group.kind, n + 1);
    picked.push(group);
  }
  return picked;
}
