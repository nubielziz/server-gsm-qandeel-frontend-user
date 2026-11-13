// Catalog lookups the API does not offer directly. A listing's slug differs per language and there is no lookup by
// service id (handoff §5.2, trap 16), so these read the whole listed catalog of one language (pages of 100, cached
// like the catalog) and index it; the browsable service list (home and /services) is filtered, counted and paged here too
// (lib/catalog-facets.ts), because the API cannot filter by type or price. Shared data only: safe inside 'use cache'.
import { cacheLife, cacheTag } from "next/cache";
import { listStoreServices } from "@/lib/api/public";
import type { StoreServiceCard } from "@/lib/api/types";
import {
  FACET_KEYS,
  facetOptions,
  filterRows,
  fitPriceRange,
  pickCollections,
  priceBounds,
  sortRows,
  type Collection,
  type FacetKey,
  type FacetOption,
  type ListFilter,
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
  /** Listed services in the language, whatever the filters. */
  catalogSize: number;
  /** Services that pass the filters. */
  total: number;
  /** The page shown (a page past the end becomes the last one). */
  page: number;
  rows: StoreServiceCard[];
  /** Each filter field's options with their counts next to the other active filters. */
  options: Record<FacetKey, FacetOption[]>;
  /** The price slider's span in whole units of `currency`; null for an empty catalog. */
  bounds: { min: number; max: number } | null;
  /** The filter as applied: the price range fitted to `bounds` (an end of the span is "no limit"). */
  filter: ListFilter;
};

/** One page of the browsable service list (home "All services" and `/services`), priced in `currency`, with its filter options. */
export async function catalogList(
  locale: Locale,
  currency: string,
  filter: ListFilter,
  sort: ListSort,
  page: number,
  perPage: number,
): Promise<CatalogList> {
  const rows = await allListedServices(locale, currency);
  const bounds = priceBounds(rows);
  const applied: ListFilter = { ...filter, ...fitPriceRange(filter.min, filter.max, bounds) };
  const matching = sortRows(filterRows(rows, applied), sort, locale);
  const pages = Math.max(1, Math.ceil(matching.length / perPage));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const options = Object.fromEntries(FACET_KEYS.map((key) => [key, facetOptions(rows, applied, key)])) as Record<FacetKey, FacetOption[]>;
  return {
    catalogSize: rows.length,
    total: matching.length,
    page: current,
    rows: matching.slice((current - 1) * perPage, current * perPage),
    options,
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
