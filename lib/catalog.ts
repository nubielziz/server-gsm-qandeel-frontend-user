// Catalog lookups the API does not offer directly. A listing's slug differs per language and there is no lookup by
// service id (handoff §5.2, trap 16), so these read the whole listed catalog of one language (pages of 100, cached
// like the catalog) and index it. Shared data only: safe inside 'use cache'.
import { cacheLife, cacheTag } from "next/cache";
import { listStoreServices } from "@/lib/api/public";
import type { StoreServiceCard } from "@/lib/api/types";
import type { Locale } from "@/lib/i18n/config";

const PAGE = 100;
const MAX_ROWS = 1000;

/** Every listed service card of one language (prices in USD, no tax), at most 1000. */
export async function allListedServices(locale: Locale): Promise<StoreServiceCard[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag("store-services");
  const rows: StoreServiceCard[] = [];
  for (let start = 0; start < MAX_ROWS; start += PAGE) {
    const page = await listStoreServices({ locale, currency: "USD", sort: "title", start, end: start + PAGE });
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

/** Distinct non-empty values of a card field (brand, network, country) for filter menus, sorted. */
export async function catalogFacets(locale: Locale): Promise<{ brands: string[]; networks: string[]; countries: string[] }> {
  const rows = await allListedServices(locale);
  const distinct = (pick: (row: StoreServiceCard) => string) =>
    [...new Set(rows.map(pick).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    brands: distinct((r) => r.brand),
    networks: distinct((r) => r.network),
    countries: distinct((r) => r.country),
  };
}
