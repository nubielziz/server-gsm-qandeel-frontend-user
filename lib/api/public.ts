// Cached reads of shared store data (no cookies): site config, services, content pages, help. Every result is the same
// for every visitor with the same arguments, so it is cached on the server with `'use cache'` (profiles in
// next.config.ts). Never add a session read here. A missing record (404) is returned as `null` and cached briefly;
// other failures (5xx, 503 MAINTENANCE, network) throw and are not cached.
import { cacheLife, cacheTag } from "next/cache";
import { isApiError } from "./errors";
import { listQuery, type ListParams } from "./query";
import { apiPublicGet, apiPublicList, type ListResult } from "./server";
import type {
  HelpArticle,
  HelpArticleDetail,
  StoreConfig,
  StorePage,
  StoreServiceCard,
  StoreServiceDetail,
} from "./types";
import type { Locale } from "@/lib/i18n/config";

async function orNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

/** `GET /store/v1/config`: currencies, tax windows, payment methods, policies, legal documents. */
export async function getStoreConfig(): Promise<StoreConfig> {
  "use cache";
  cacheLife("catalog");
  cacheTag("store-config");
  return apiPublicGet<StoreConfig>("/store/v1/config");
}

export type ServiceListArgs = {
  locale: Locale;
  currency: string;
  q?: string;
  brand?: string;
  network?: string;
  country?: string;
  featured?: boolean;
  /** `featured` (default order), `sort` or `title`. */
  sort?: "featured" | "sort" | "title";
  order?: "asc" | "desc";
  start?: number;
  end?: number;
  buyerCountry?: string;
};

/** `GET /store/v1/services`: one page of service cards (at most 100 rows), priced in `currency`. */
export async function listStoreServices(args: ServiceListArgs): Promise<ListResult<StoreServiceCard>> {
  "use cache";
  cacheLife("catalog");
  cacheTag("store-services");
  const list: ListParams = {
    start: args.start ?? 0,
    end: Math.min(args.end ?? 24, (args.start ?? 0) + 100),
    q: args.q,
    sort: args.sort,
    order: args.sort ? (args.order ?? (args.sort === "featured" ? "desc" : "asc")) : undefined,
  };
  return apiPublicList<StoreServiceCard>("/store/v1/services", {
    query: listQuery(list, {
      locale: args.locale,
      currency: args.currency,
      brand: args.brand,
      network: args.network,
      country: args.country,
      featured: args.featured,
      buyerCountry: args.buyerCountry,
    }),
  });
}

/** `GET /store/v1/services/:slug` in one language and currency; `null` when the listing does not exist. */
export async function getStoreService(
  slug: string,
  args: { locale: Locale; currency: string; buyerCountry?: string },
): Promise<StoreServiceDetail | null> {
  "use cache";
  cacheLife("catalog");
  cacheTag("store-services", `store-service:${slug}`);
  return orNull(
    apiPublicGet<StoreServiceDetail>(`/store/v1/services/${encodeURIComponent(slug)}`, {
      query: { locale: args.locale, currency: args.currency, buyerCountry: args.buyerCountry },
    }),
  );
}

/** `GET /store/v1/pages/:slug` (content and legal pages); `null` when missing or a draft. */
export async function getContentPage(slug: string, locale: Locale): Promise<StorePage | null> {
  "use cache";
  cacheLife("content");
  cacheTag("store-pages", `store-page:${slug}`);
  return orNull(apiPublicGet<StorePage>(`/store/v1/pages/${encodeURIComponent(slug)}`, { query: { locale } }));
}

/** `GET /store/v1/help`: published help articles of one language. */
export async function listHelpArticles(args: {
  locale: Locale;
  q?: string;
  category?: string;
  start?: number;
  end?: number;
}): Promise<ListResult<HelpArticle>> {
  "use cache";
  cacheLife("content");
  cacheTag("store-help");
  return apiPublicList<HelpArticle>("/store/v1/help", {
    query: listQuery(
      { start: args.start ?? 0, end: args.end ?? 50, q: args.q },
      { locale: args.locale, category: args.category },
    ),
  });
}

/** `GET /store/v1/help/:slug` (only the leading id of the slug counts); `null` when unknown. */
export async function getHelpArticle(slug: string): Promise<HelpArticleDetail | null> {
  "use cache";
  cacheLife("content");
  cacheTag("store-help");
  return orNull(apiPublicGet<HelpArticleDetail>(`/store/v1/help/${encodeURIComponent(slug)}`));
}
