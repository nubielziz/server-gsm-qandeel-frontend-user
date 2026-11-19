// Catalog lookups the API does not offer directly. There is no lookup by service id (handoff §5.2, trap 16), so these
// read the whole listed catalog (pages of 100, cached like the catalog) and index it. The browsable service list (home and /services) takes its rows and total from the
// API, which filters, sorts and pages (`GET /store/v1/services`, plan D12); the numbers beside the options (how many
// services each would show, "In stock only") and the price slider's span are counted here over the cached catalog, with
// the API's own rules (lib/catalog-facets.ts), because that route has no facet counts. Shared data only.
// A text search (feature 29, backend plan §7) is read for the visitor, never from the cache (lib/api/visitor.ts), from
// the search engine (`GET /store/v1/search`: rows, facet counts, price span, "Did you mean"). When the engine is down the
// search route answers from the database without facets (`engine: 'fallback'`): the options then come from the cached
// catalog again, without their numbers.
import { cacheLife, cacheTag } from "next/cache";
import { listStoreCategories, listStoreServices } from "@/lib/api/public";
import { MAX_PAGE_SIZE, SEARCH_MAX_PAGE, SEARCH_MAX_PER_PAGE } from "@/lib/api/store-query";
import type { SearchBody, SearchEngineName, StoreCategory, StoreServiceCard } from "@/lib/api/types";
import { searchStore } from "@/lib/api/visitor";
import {
  FACET_KEYS,
  clampPage,
  cleanText,
  collectionFilter,
  facetOptions,
  facetOptionsFromCounts,
  fitPriceRange,
  inStockCount,
  listFilterArgs,
  pageCount,
  pickCollections,
  priceBounds,
  requestedPage,
  resolveCategories,
  searchFilterArgs,
  searchSortQuery,
  searchesEngine,
  sortQuery,
  type CategoryEntry,
  type Collection,
  type FacetKey,
  type FacetOption,
  type ListFilter,
  type ListInput,
  type ListSort,
} from "@/lib/catalog-facets";
import { compareMoney } from "@/lib/format";
import { imeiFromQuery, searchText } from "@/lib/search/terms";

const PAGE = 100;
const MAX_ROWS = 1000;

/**
 * Every listed service card (no tax), at most 1000, in the API's default order (featured first, then the staff's order,
 * then by title). Prices in `currency`: USD unless a price is shown.
 */
export async function allListedServices(currency = "USD"): Promise<StoreServiceCard[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag("store-services");
  const rows: StoreServiceCard[] = [];
  for (let start = 0; start < MAX_ROWS; start += PAGE) {
    const page = await listStoreServices({ currency, start, end: start + PAGE });
    rows.push(...page.data);
    if (rows.length >= page.total || page.data.length < PAGE) break;
  }
  return rows;
}

/** The slug of a service's page, or null when it is not listed. */
export async function slugForService(serviceId: number): Promise<string | null> {
  const rows = await allListedServices();
  return rows.find((row) => row.id === serviceId)?.slug ?? null;
}

export type CatalogCount = { name: string; count: number };

/** The brands and carriers with how many listed services each has (largest first, then by name), and the catalog size. */
export async function catalogCounts(): Promise<{ total: number; brands: CatalogCount[]; networks: CatalogCount[] }> {
  const rows = await allListedServices();
  const count = (pick: (row: StoreServiceCard) => string): CatalogCount[] => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const name = pick(row);
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts].map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  };
  return { total: rows.length, brands: count((r) => r.brand), networks: count((r) => r.network) };
}

export type CatalogList = {
  /** Listed services, whatever the filters (counted over the cached catalog, at most 1000). */
  catalogSize: number;
  /** Services that pass the filters (the API's `x-total-count`). */
  total: number;
  /** The page shown (a page past the end becomes the last one). */
  page: number;
  /** The page's rows, filtered, sorted and paged by the API. */
  rows: StoreServiceCard[];
  /** Each filter field's options with their counts next to the other active filters. */
  options: Record<FacetKey, FacetOption[]>;
  /** The categories the API lists, in its order, each with `serviceCount` (no other filter narrows it). */
  categories: StoreCategory[];
  /** The `category` values of the URL resolved against `categories` (listed or not). */
  categoryEntries: CategoryEntry[];
  /** How many services "In stock only" would show next to the other active filters. */
  inStock: number;
  /** The price slider's span in whole units of `currency`; null for an empty catalog. */
  bounds: { min: number; max: number } | null;
  /** The filter as applied: listed categories only, the price range fitted to `bounds` (an end of the span is "no limit"). */
  filter: ListFilter;
  /** Whether the numbers beside the options are real (false on a search the database answered: they are hidden then). */
  counts: boolean;
  /** What only a text search has; null on every other list. */
  search: SearchInfo | null;
};

/** The extras of a search-engine page (`GET /store/v1/search`). */
export type SearchInfo = {
  engine: SearchEngineName;
  /** The corrected query ("Did you mean …?"), or null. */
  didYouMean: string | null;
  /** The IMEI the text holds (the page offers "Check IMEI …"), or null. */
  imei: string | null;
  /** A price sort or price bounds ran over the best 1000 matches and more matched. */
  truncated: boolean;
};

/**
 * One page of the browsable service list (home "All services" and `/services`), priced in `currency`, with its filter
 * options. The cached catalog and the category list come first: the request to the API needs the listed category ids
 * and the fitted price range (so every spelling of one filter is one cached request). A page past the end is read again
 * as the last page.
 */
export async function catalogList(
  currency: string,
  input: ListInput,
  sort: ListSort,
  page: number,
  perPage: number,
): Promise<CatalogList> {
  const [catalog, categories] = await Promise.all([allListedServices(currency), listStoreCategories()]);
  const bounds = priceBounds(catalog);
  const { entries, ids } = resolveCategories(input.category, categories);
  const applied: ListFilter = { ...input, category: ids, ...fitPriceRange(input.min, input.max, bounds) };
  // A text the API normalises to nothing (`&`, `()`, an emoji) is no search: the route would answer 422
  // (backend plan 29 §5.3: `q` is 1-100 characters after normalising), so the page shows the plain list instead.
  if (searchText(applied.q) === "") applied.q = "";

  if (searchesEngine(applied.q)) return searchList({ catalog, categories, entries, applied, bounds, currency, sort, page, perPage });

  // No text search is left here (`applied.q` is ""): the list is the cached one.
  const size = Math.min(Math.max(1, Math.floor(perPage)), MAX_PAGE_SIZE);
  const read = (n: number) => listStoreServices({ currency, ...listFilterArgs(applied), ...sortQuery(sort), start: (n - 1) * size, end: n * size });
  const wanted = requestedPage(page);
  let result = await read(wanted);
  const current = clampPage(wanted, result.total, size);
  // Past the end the API answers no rows with the true total; an empty list stays on page 1 without another read.
  if (current !== wanted && result.total > 0) result = await read(current);

  const options = Object.fromEntries(FACET_KEYS.map((key) => [key, facetOptions(catalog, applied, key)])) as Record<FacetKey, FacetOption[]>;
  return {
    catalogSize: catalog.length,
    total: result.total,
    page: current,
    rows: result.data,
    options,
    categories,
    categoryEntries: entries,
    inStock: inStockCount(catalog, applied),
    bounds,
    filter: applied,
    counts: true,
    search: null,
  };
}

type SearchListInput = {
  catalog: StoreServiceCard[];
  categories: StoreCategory[];
  entries: CategoryEntry[];
  applied: ListFilter;
  /** The cached catalog's price span (the URL's range is fitted to it before the request). */
  bounds: { min: number; max: number } | null;
  currency: string;
  sort: ListSort;
  page: number;
  perPage: number;
};

/** The whole units a price span covers: the lowest price rounded down to the highest rounded up; null when unreadable. */
function spanOf(range: SearchBody["priceRange"]): { min: number; max: number } | null {
  if (!range) return null;
  const min = Math.floor(Number(range.min));
  const max = Math.ceil(Number(range.max));
  return Number.isFinite(min) && Number.isFinite(max) && min <= max ? { min, max } : null;
}

/**
 * One search page from the search engine: its rows and total, the options with the engine's facet counts (each
 * group ignores its own selection), the price slider over the matches (page 1 without a price bound; later pages, a
 * bounded page and the fallback use the catalog's span), "Did you mean", the IMEI intent. Pages stop at 50 (the route's limit). When the database answered
 * (`engine: 'fallback'`, no facets), the options come from the cached catalog with their numbers hidden.
 */
async function searchList({ catalog, categories, entries, applied, bounds, currency, sort, page, perPage }: SearchListInput): Promise<CatalogList> {
  const size = Math.min(Math.max(1, Math.floor(perPage)), SEARCH_MAX_PER_PAGE);
  const read = (n: number) =>
    searchStore({ q: cleanText(applied.q), currency, page: n, perPage: size, ...searchFilterArgs(applied), ...searchSortQuery(sort) });
  const wanted = Math.min(requestedPage(page), SEARCH_MAX_PAGE);
  let result = await read(wanted);
  const current = Math.min(wanted, pageCount(result.total, size), SEARCH_MAX_PAGE);
  // Past the end the route answers no rows with the true total; an empty result stays on page 1 without another read.
  if (current !== wanted && result.total > 0) result = await read(current);

  const facets = result.engine === "typesense" ? result.facets : null;
  const options = Object.fromEntries(
    FACET_KEYS.map((key) => [key, facets ? facetOptionsFromCounts(facets[key], applied[key]) : facetOptions(catalog, applied, key)]),
  ) as Record<FacetKey, FacetOption[]>;
  // The categories keep the API's order and slugs; on a search their number is how many matches each holds.
  const matches = facets ? new Map(facets.category.map((category) => [category.id, category.count])) : null;
  const counted = matches ? categories.map((category) => ({ ...category, serviceCount: matches.get(category.id) ?? 0 })) : categories;
  return {
    catalogSize: catalog.length,
    total: result.total,
    page: current,
    rows: Array.isArray(result.hits) ? result.hits : [],
    options,
    categories: counted,
    categoryEntries: entries,
    inStock: facets ? facets.availability.in_stock : inStockCount(catalog, applied),
    // The span over the matches only while no price bound is applied: §5.3 does not say whether `priceRange` ignores
    // minPrice/maxPrice, and a span cut to the bound would make its end "no limit" (list-filters), dropping the bound.
    bounds: (current === 1 && applied.min === null && applied.max === null ? spanOf(result.priceRange) : null) ?? bounds,
    filter: applied,
    counts: facets !== null,
    search: {
      engine: result.engine,
      didYouMean: result.didYouMean?.trim() || null,
      imei: result.intent === "imei" ? imeiFromQuery(applied.q) : null,
      truncated: Boolean(result.truncated),
    },
  };
}

/** How many services a featured collection's home card lists. */
export const COLLECTION_PEEK = 3;

/** A featured collection with the services its home card lists. */
export type FeaturedCollection = Collection & {
  /** Its best sellers (at most `COLLECTION_PEEK`): the API's `popular` sort filtered by the collection. */
  top: StoreServiceCard[];
};

/**
 * The featured collections, each with its lowest card price and its best sellers in `currency`. The groups and their
 * counts come from the cached catalog; the best sellers from one small cached list read per collection, because the
 * cards carry no sales number.
 */
export async function catalogCollections(currency: string): Promise<FeaturedCollection[]> {
  const collections = pickCollections(await allListedServices(currency));
  return Promise.all(
    collections.map(async (collection) => {
      const list = await listStoreServices({
        currency,
        ...collectionFilter(collection),
        ...sortQuery("popular"),
        start: 0,
        end: COLLECTION_PEEK,
      });
      return { ...collection, top: list.data };
    }),
  );
}

/** The lowest listed price in `currency` (what its card shows: no tax), or null for an empty catalog. */
export async function lowestPrice(currency: string): Promise<StoreServiceCard["price"] | null> {
  const rows = await allListedServices(currency);
  let lowest: StoreServiceCard["price"] | null = null;
  for (const row of rows) {
    if (!lowest || compareMoney(row.price.gross, lowest.gross) < 0) lowest = row.price;
  }
  return lowest;
}
