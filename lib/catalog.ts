// Catalog lookups the API does not offer directly. A listing's slug differs per language and there is no lookup by
// service id (handoff §5.2, trap 16), so these read the whole listed catalog of one language (pages of 100, cached
// like the catalog) and index it. The browsable service list (home and /services) takes its rows and total from the
// API, which filters, sorts and pages (`GET /store/v1/services`, plan D12); the numbers beside the options (how many
// services each would show, "In stock only") and the price slider's span are counted here over the cached catalog, with
// the API's own rules (lib/catalog-facets.ts), because the API has no facet counts. Shared data only: safe inside
// 'use cache'.
import { cacheLife, cacheTag } from "next/cache";
import { listStoreCategories, listStoreServices } from "@/lib/api/public";
import { MAX_PAGE_SIZE } from "@/lib/api/store-query";
import type { StoreCategory, StoreServiceCard } from "@/lib/api/types";
import {
  FACET_KEYS,
  clampPage,
  facetOptions,
  fitPriceRange,
  inStockCount,
  listFilterArgs,
  pickCollections,
  priceBounds,
  requestedPage,
  resolveCategories,
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
import type { Locale } from "@/lib/i18n/config";

const PAGE = 100;
const MAX_ROWS = 1000;

/**
 * Every listed service card of one language (no tax), at most 1000, in the API's default order (featured first, then
 * the staff's order, then by title). Prices in `currency`: USD unless a price is shown.
 */
export async function allListedServices(locale: Locale, currency = "USD"): Promise<StoreServiceCard[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag("store-services");
  const rows: StoreServiceCard[] = [];
  for (let start = 0; start < MAX_ROWS; start += PAGE) {
    const page = await listStoreServices({ locale, currency, start, end: start + PAGE });
    rows.push(...page.data);
    if (rows.length >= page.total || page.data.length < PAGE) break;
  }
  return rows;
}

/** The slug of a service in a language, or null when it is not listed in that language. */
export async function slugForService(serviceId: number, locale: Locale): Promise<string | null> {
  const rows = await allListedServices(locale);
  return rows.find((row) => row.id === serviceId)?.slug ?? null;
}

export type CatalogCount = { name: string; count: number };

/** The brands and carriers with how many listed services each has (largest first, then by name), and the catalog size. */
export async function catalogCounts(locale: Locale): Promise<{ total: number; brands: CatalogCount[]; networks: CatalogCount[] }> {
  const rows = await allListedServices(locale);
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
  /** Listed services in the language, whatever the filters (counted over the cached catalog, at most 1000). */
  catalogSize: number;
  /** Services that pass the filters (the API's `x-total-count`). */
  total: number;
  /** The page shown (a page past the end becomes the last one). */
  page: number;
  /** The page's rows, filtered, sorted and paged by the API. */
  rows: StoreServiceCard[];
  /** Each filter field's options with their counts next to the other active filters. */
  options: Record<FacetKey, FacetOption[]>;
  /** The categories the API lists for the language, in its order, each with `serviceCount` (no other filter narrows it). */
  categories: StoreCategory[];
  /** The `category` values of the URL resolved against `categories` (listed or not). */
  categoryEntries: CategoryEntry[];
  /** How many services "In stock only" would show next to the other active filters. */
  inStock: number;
  /** The price slider's span in whole units of `currency`; null for an empty catalog. */
  bounds: { min: number; max: number } | null;
  /** The filter as applied: listed categories only, the price range fitted to `bounds` (an end of the span is "no limit"). */
  filter: ListFilter;
};

/**
 * One page of the browsable service list (home "All services" and `/services`), priced in `currency`, with its filter
 * options. The cached catalog and the category list come first: the request to the API needs the listed category ids
 * and the fitted price range (so every spelling of one filter is one cached request). A page past the end is read again
 * as the last page.
 */
export async function catalogList(
  locale: Locale,
  currency: string,
  input: ListInput,
  sort: ListSort,
  page: number,
  perPage: number,
): Promise<CatalogList> {
  const [catalog, categories] = await Promise.all([allListedServices(locale, currency), listStoreCategories(locale)]);
  const bounds = priceBounds(catalog);
  const { entries, ids } = resolveCategories(input.category, categories);
  const applied: ListFilter = { ...input, category: ids, ...fitPriceRange(input.min, input.max, bounds) };

  const size = Math.min(Math.max(1, Math.floor(perPage)), MAX_PAGE_SIZE);
  const read = (n: number) =>
    listStoreServices({ locale, currency, ...listFilterArgs(applied), ...sortQuery(sort), start: (n - 1) * size, end: n * size });
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
  };
}

/** The featured collections of a language, each with its lowest card price in `currency`. */
export async function catalogCollections(locale: Locale, currency: string): Promise<Collection[]> {
  return pickCollections(await allListedServices(locale, currency));
}

/** The lowest listed price in `currency` (what its card shows: no tax), or null for an empty catalog. */
export async function lowestPrice(locale: Locale, currency: string): Promise<StoreServiceCard["price"] | null> {
  const rows = await allListedServices(locale, currency);
  let lowest: StoreServiceCard["price"] | null = null;
  for (const row of rows) {
    if (!lowest || compareMoney(row.price.gross, lowest.gross) < 0) lowest = row.price;
  }
  return lowest;
}
