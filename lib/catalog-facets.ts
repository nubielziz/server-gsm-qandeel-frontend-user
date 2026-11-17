// Faceted browsing of the listed catalog. Two halves that must agree (plan D12):
// - the rows and their total of the browsable service list (home "All services" and `/services`) come from the API
//   (`GET /store/v1/services`: type, category, brand, carrier, country, availability, price range, text search, sorts,
//   paging); this file builds that request from the visitor's URL (`listFilterArgs`, `sortQuery`) and keeps the paging
//   inside what the API accepts (`requestedPage`, `clampPage`);
// - the option lists (how many services each option would show, the "In stock only" count) and the price slider's span
//   are worked out in memory over the cards that lib/catalog.ts reads (cached): the API has no facet counts (handoff
//   §1.7). `passes` follows the API's own rules (brand, carrier, country: exact, case-insensitive; `q` over title,
//   summary, brand and carrier; the price range inclusive, no tax), so a count equals the total the API would answer.
// A text search (feature 29) asks the search route instead (`searchFilterArgs`, `searchSortQuery`; options from
// its facet counts, `facetOptionsFromCounts`) and has its own sorts ("Best match" first, no "Featured").
// Also the "Featured collections" of the home page. Pure functions: unit-tested, safe anywhere.
import type { ServiceListArgs, StoreSearchArgs } from "@/lib/api/store-query";
import type { SearchFacetCount, ServiceType, StoreCategory, StoreServiceCard } from "@/lib/api/types";
import { compareMoney } from "@/lib/format";
import { searchText } from "@/lib/search/terms";

/** The card fields the list can be filtered by; each is a query parameter that may repeat (`brand=A&brand=B`). */
export const FACET_KEYS = ["type", "brand", "network", "country"] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

/**
 * Active filters as the list applies them. Several values of one field match any of them; different fields must all
 * match. `min` and `max` are whole units of the rows' currency (the visitor's), null for "no limit". `category` holds
 * ids of categories the API lists (see `resolveCategories`); `inStock` keeps only services the API reports `in_stock`.
 */
export type ListFilter = {
  q: string;
  min: number | null;
  max: number | null;
  category: number[];
  inStock: boolean;
} & Record<FacetKey, string[]>;

/** What the URL asks for: the same as `ListFilter`, with the categories as typed (`resolveCategories` turns them into ids). */
export type ListInput = Omit<ListFilter, "category"> & { category: string[] };

export const NO_FILTER: ListFilter = { q: "", min: null, max: null, category: [], inStock: false, type: [], brand: [], network: [], country: [] };

export type FacetOption = {
  /** The value as the catalog spells it (sent back as the query parameter). */
  value: string;
  /** How many services the list would show with this option and the other active filters. */
  count: number;
  selected: boolean;
};

/** The service types the API knows (`type` filter values). */
export const SERVICE_TYPES: readonly ServiceType[] = ["imei", "server", "remote", "file"];

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const units = (n: number) => `${n}.0000`;

/**
 * Text from the URL without control characters. The API answers 500 to a NUL byte in `q`, `brand` or `network` (the
 * database refuses it), and a control character means nothing in a search or an option's name.
 */
export function cleanText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

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
  if (filter.category.length > 0 && !filter.category.includes(row.category.id)) return false;
  if (filter.inStock && row.availability !== "in_stock") return false;
  return FACET_KEYS.every((key) => key === except || filter[key].length === 0 || filter[key].some((value) => same(row[key], value)));
}

/** The cards that pass every active filter, in their order: what the API's own filters keep (the rows themselves come from the API). */
export function filterRows(rows: StoreServiceCard[], filter: ListFilter): StoreServiceCard[] {
  return rows.filter((row) => passes(row, filter));
}

/**
 * How many services "In stock only" would show next to the other active filters (the category, price range and search
 * included): the number beside the checkbox, and the list's total once the box is ticked. Never a stock level.
 */
export function inStockCount(rows: StoreServiceCard[], filter: ListFilter): number {
  return filterRows(rows, { ...filter, inStock: true }).length;
}

/**
 * The options of one field with how many services each would show next to the other active filters (the category,
 * availability, price range and the search included): most first, then by name. Options that would show nothing are
 * left out, except selected ones (a typed or outdated link).
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
 * A price range from the URL, fitted to the slider: a reversed range is turned round first (the API answers 422 to a
 * `maxPrice` below `minPrice`), then each end is held inside the catalog's span, and an end at the span's edge means "no
 * limit". Fitted values keep the request (and its cache entry) the same for every spelling of the same range.
 */
export function fitPriceRange(min: number | null, max: number | null, bounds: { min: number; max: number } | null): { min: number | null; max: number | null } {
  if (!bounds) return { min: null, max: null };
  const [from, to] = min !== null && max !== null && min > max ? [max, min] : [min, max];
  const inside = (n: number) => Math.min(Math.max(n, bounds.min), bounds.max);
  const low = from === null ? null : inside(from);
  const high = to === null ? null : inside(to);
  return { min: low === null || low <= bounds.min ? null : low, max: high === null || high >= bounds.max ? null : high };
}

/**
 * A price bound as the API reads it (`^\d{1,12}(\.\d{1,4})?$`): a whole non-negative number of at most 12 digits, or
 * `undefined` (the parameter is then left out; the API answers 422 to a malformed bound).
 */
export function priceParam(bound: number | null): string | undefined {
  if (bound === null || !Number.isSafeInteger(bound) || bound < 0) return undefined;
  const text = String(bound);
  return text.length <= 12 ? text : undefined;
}

// ── Categories

/** The part of a category the list needs (`GET /store/v1/categories`). */
export type CategoryRef = Pick<StoreCategory, "id" | "slug" | "name">;

/** One `category` value of the URL, resolved against the categories the API lists. */
export type CategoryEntry = {
  /** What links carry: the API's own slug for a listed category, the text as typed otherwise. */
  value: string;
  /** The category's id; null when the text carries none. */
  id: number | null;
  /** The category's name; for an unlisted one the words of the text (`99-old-phones` → "old phones"). */
  label: string;
  /** False when the API lists no such category (an outdated link). */
  known: boolean;
};

/** The id of a category slug: the number before the first hyphen (`4-carrier-unlock` → 4, `4` → 4); null when there is none. */
export function categoryId(text: string): number | null {
  const match = /^(\d{1,9})(?:-|$)/.exec(text.trim());
  const id = match ? Number(match[1]) : 0;
  return id > 0 ? id : null;
}

/** The words of a slug without its id, for the chip of a category the API does not list. */
function categoryWords(text: string): string {
  return text.replace(/^\d+-?/, "").replace(/-+/g, " ").trim() || text;
}

/**
 * The `category` values of the URL against the categories the API lists, one entry each (the same category twice, by
 * id or by slug, counts once). `ids` are the listed ones only: an unlisted id is not sent to the API (it would show an
 * empty list for a link that is merely outdated) but keeps its entry, so
 * it still shows as a chip the visitor can remove.
 */
export function resolveCategories(raw: readonly string[], categories: readonly CategoryRef[]): { entries: CategoryEntry[]; ids: number[] } {
  const listed = new Map(categories.map((category) => [category.id, category]));
  const seen = new Set<string>();
  const entries: CategoryEntry[] = [];
  for (const text of raw) {
    const id = categoryId(text);
    const category = id === null ? undefined : listed.get(id);
    const key = category ? `id:${category.id}` : `text:${text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(
      category
        ? { value: category.slug, id: category.id, label: category.name, known: true }
        : { value: text, id, label: categoryWords(text), known: false },
    );
  }
  return { entries, ids: entries.flatMap((entry) => (entry.known && entry.id !== null ? [entry.id] : [])) };
}

// ── Sorts

/** The sorts of the toolbar. `featured` is the default and sends no `_sort` (the API's own order). */
export const LIST_SORTS = ["featured", "popular", "newest", "price_asc", "price_desc", "title"] as const;
/**
 * The sorts of a page with a text search (backend plan 29 §7): "Best match" (`relevance`) first and the
 * default, so it never shows in the URL; "Featured" is not offered there.
 */
export const SEARCH_SORTS = ["relevance", "popular", "newest", "price_asc", "price_desc", "title"] as const;
export type ListSort = (typeof LIST_SORTS)[number] | (typeof SEARCH_SORTS)[number];

/**
 * Whether a list page is answered by the search engine (`GET /store/v1/search`): a text search the API accepts
 * (`searchText`: not empty after its normalising, so `&`, `()` or an emoji alone is no search and the route never
 * answers 422). Every text search goes there (English only, decision 039).
 */
export function searchesEngine(q: string): boolean {
  return searchText(q) !== "";
}

/** The sorts a page offers, in display order. */
export function sortsFor(search: boolean): readonly ListSort[] {
  return search ? SEARCH_SORTS : LIST_SORTS;
}

/** The sort a page uses when the URL names none (and leaves out of its links). */
export function defaultSort(search: boolean): ListSort {
  return search ? "relevance" : "featured";
}

/** The `sort` value of the URL; anything the page does not offer is its default. */
export function parseSort(value: string, search = false): ListSort {
  return (sortsFor(search) as readonly string[]).includes(value) ? (value as ListSort) : defaultSort(search);
}

/** What a sort asks the API for (`_sort` and `_order`): best sellers = `popular` desc, new arrivals = `listedAt` desc. */
export function sortQuery(sort: ListSort): Pick<ServiceListArgs, "sort" | "order"> {
  switch (sort) {
    case "popular":
      return { sort: "popular", order: "desc" };
    case "newest":
      return { sort: "listedAt", order: "desc" };
    case "price_asc":
      return { sort: "price", order: "asc" };
    case "price_desc":
      return { sort: "price", order: "desc" };
    case "title":
      return { sort: "title", order: "asc" };
    case "featured":
    case "relevance":
      return {};
  }
}

/** The same for the search route (`sort`/`order`): best match sends nothing. */
export function searchSortQuery(sort: ListSort): Pick<StoreSearchArgs, "sort" | "order"> {
  switch (sort) {
    case "popular":
      return { sort: "popular" };
    case "newest":
      return { sort: "listedAt", order: "desc" };
    case "price_asc":
      return { sort: "price", order: "asc" };
    case "price_desc":
      return { sort: "price", order: "desc" };
    case "title":
      return { sort: "title", order: "asc" };
    case "featured":
    case "relevance":
      return {};
  }
}

// ── Requests

type FilterArgs = Pick<ServiceListArgs, "q" | "type" | "categoryId" | "brand" | "network" | "country" | "availability" | "minPrice" | "maxPrice">;

/**
 * The API filters of an applied list filter (`catalogList` fits the price range and the categories first). Only what is
 * set: an empty list or text is left out, control characters are removed (`cleanText`), and arrays are sorted, so every
 * spelling of one filter is one cached request.
 */
export function listFilterArgs(filter: ListFilter): FilterArgs {
  const args: FilterArgs = {};
  const q = cleanText(filter.q);
  if (q) args.q = q;
  const types = filter.type.filter((value): value is ServiceType => (SERVICE_TYPES as readonly string[]).includes(value));
  if (types.length > 0) args.type = [...types].sort();
  if (filter.category.length > 0) args.categoryId = [...filter.category].sort((a, b) => a - b);
  for (const key of ["brand", "network", "country"] as const) {
    const values = filter[key].map(cleanText).filter(Boolean);
    if (values.length > 0) args[key] = values.sort();
  }
  if (filter.inStock) args.availability = "in_stock";
  const min = priceParam(filter.min);
  const max = priceParam(filter.max);
  if (min !== undefined) args.minPrice = min;
  if (max !== undefined) args.maxPrice = max;
  return args;
}

/** The search route's filters of an applied list filter (the same values as `listFilterArgs`, without `q`). */
export function searchFilterArgs(filter: ListFilter): Omit<StoreSearchArgs, "q" | "currency" | "page" | "perPage" | "sort" | "order"> {
  const { type, categoryId, brand, network, country, minPrice, maxPrice } = listFilterArgs(filter);
  return { type, categoryId, brand, network, country, minPrice, maxPrice, availability: filter.inStock ? "in_stock" : undefined };
}

/**
 * The options of one field from the search route's facet counts (`value` = what the catalog spells: a brand or carrier
 * label, an ISO country code, a service type), most first, then by name. Selected values the facets lack stay, with 0.
 */
export function facetOptionsFromCounts(counts: readonly SearchFacetCount[], selected: readonly string[]): FacetOption[] {
  const merged = new Map<string, { value: string; count: number }>();
  for (const { value, count } of counts) {
    if (!value || !Number.isFinite(count) || count <= 0) continue;
    const entry = merged.get(value.toLowerCase());
    if (entry) entry.count += count;
    else merged.set(value.toLowerCase(), { value, count });
  }
  const options = [...merged.values()].map(({ value, count }) => ({ value, count, selected: selected.some((s) => same(value, s)) }));
  for (const value of selected) {
    if (!options.some((option) => same(option.value, value))) options.push({ value, count: 0, selected: true });
  }
  return options.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

// ── Paging

/** The highest page served: the API refuses a `_start` above 10 000 000, and nobody pages that far. */
export const MAX_PAGE = 10_000;

/** The page number a URL asks for: a whole number from 1 to `MAX_PAGE` (anything else is page 1, or the cap). */
export function requestedPage(page: number): number {
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(Math.floor(page), MAX_PAGE);
}

/** How many pages `total` rows make (at least 1, so an empty list is still page 1). */
export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, perPage)));
}

/** A page past the end becomes the last one. */
export function clampPage(page: number, total: number, perPage: number): number {
  return Math.min(requestedPage(page), pageCount(total, perPage));
}

// ── Featured collections

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
