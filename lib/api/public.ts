// Cached reads of shared store data (no cookies): site config, services, content pages, help, old addresses. Every
// result is the same for every visitor with the same arguments, so it is cached on the server with `'use cache'`
// (profiles in next.config.ts). Never add a session read here. A missing record (404) is returned as `null` and cached
// briefly; other failures (5xx, 503 MAINTENANCE, network) throw and are not cached. No read sends a language: the site
// and the API are English only (decision 039), and the list routes answer 422 to an unknown query key.
import { cacheLife, cacheTag } from "next/cache";
import { isApiError } from "./errors";
import { listQuery } from "./query";
import { apiPublicGet, apiPublicList, type ListResult } from "./server";
import { pageWindow, storeServicesQuery, type ServiceListArgs } from "./store-query";
import type {
  HelpArticle,
  HelpArticleDetail,
  LegacySlug,
  LegacySlugKind,
  StoreCategory,
  StoreConfig,
  StorePage,
  StorePageListItem,
  StoreServiceCard,
  StoreServiceDetail,
  SuggestBody,
} from "./types";

export type { ServiceListArgs, ServiceSort } from "./store-query";

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

/**
 * `GET /store/v1/services`: one page of service cards (at most 100 rows), priced in `args.currency`. Filters, sorts and
 * paging run on the server (`storeServicesQuery`); the total is `x-total-count`.
 */
export async function listStoreServices(args: ServiceListArgs): Promise<ListResult<StoreServiceCard>> {
  "use cache";
  cacheLife("catalog");
  cacheTag("store-services");
  return apiPublicList<StoreServiceCard>("/store/v1/services", { query: storeServicesQuery(args) });
}

/** `GET /store/v1/categories`: the catalog categories, with `serviceCount` (not narrowed by filters). */
export async function listStoreCategories(): Promise<StoreCategory[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag("store-categories");
  const body = await apiPublicGet<{ categories: StoreCategory[] }>("/store/v1/categories");
  return body.categories;
}

/** `GET /store/v1/services/:slug` in one currency; `null` when the service has no page under this slug. */
export async function getStoreService(
  slug: string,
  args: { currency: string; buyerCountry?: string },
): Promise<StoreServiceDetail | null> {
  "use cache";
  cacheLife("catalog");
  cacheTag("store-services", `store-service:${slug}`);
  return orNull(
    apiPublicGet<StoreServiceDetail>(`/store/v1/services/${encodeURIComponent(slug)}`, {
      query: { currency: args.currency, buyerCountry: args.buyerCountry },
    }),
  );
}

/** `GET /store/v1/pages/:slug` (content and legal pages); `null` when missing or a draft. */
export async function getContentPage(slug: string): Promise<StorePage | null> {
  "use cache";
  cacheLife("content");
  cacheTag("store-pages", `store-page:${slug}`);
  return orNull(apiPublicGet<StorePage>(`/store/v1/pages/${encodeURIComponent(slug)}`));
}

/** `GET /store/v1/pages`: published content pages, newest first (no body; at most 100 a page). */
export async function listContentPages(args: {
  kind?: StorePageListItem["kind"] | StorePageListItem["kind"][];
  start?: number;
  end?: number;
}): Promise<ListResult<StorePageListItem>> {
  "use cache";
  cacheLife("content");
  cacheTag("store-pages");
  return apiPublicList<StorePageListItem>("/store/v1/pages", {
    query: listQuery(pageWindow(args, 100), { kind: args.kind }),
  });
}

/** `GET /store/v1/help`: published help articles. */
export async function listHelpArticles(args: {
  q?: string;
  category?: string;
  start?: number;
  end?: number;
}): Promise<ListResult<HelpArticle>> {
  "use cache";
  cacheLife("content");
  cacheTag("store-help");
  return apiPublicList<HelpArticle>("/store/v1/help", {
    query: listQuery({ start: args.start ?? 0, end: args.end ?? 50, q: args.q }, { category: args.category }),
  });
}

/** The longest slug `GET /store/v1/legacy-slugs/:kind/:slug` accepts (a longer one answers 422, so it is never sent). */
const LEGACY_SLUG_MAX = 200;

/** A path of this site (`/…`, not `//host` or `/\host`), or null. Guards the redirects that follow an API answer. */
function sitePathOrNull(path: unknown): string | null {
  return typeof path === "string" && /^\/(?![/\\])/.test(path) ? path : null;
}

/**
 * `GET /store/v1/legacy-slugs/:kind/:slug`: where an address retired by English only now leads (decision 039, plan 30
 * §4.5). Ask it only after the page's own lookup found nothing. `null` for an address that was never retired, an empty or
 * too long slug (not sent), or an answer whose `path` is not a path of this site.
 */
export async function getLegacySlug(kind: LegacySlugKind, slug: string): Promise<LegacySlug | null> {
  "use cache";
  cacheLife("content");
  cacheTag("store-legacy-slugs");
  if (slug === "" || slug.length > LEGACY_SLUG_MAX) return null;
  const answer = await orNull(
    apiPublicGet<LegacySlug>(`/store/v1/legacy-slugs/${encodeURIComponent(kind)}/${encodeURIComponent(slug)}`),
  );
  const path = sitePathOrNull(answer?.path);
  if (!answer || !path) return null;
  return { path, slug: typeof answer.slug === "string" && answer.slug !== "" ? answer.slug : null };
}

/**
 * The site path (no language prefix) an old page or help address leads to now (`/` or `/help`), or null when the address
 * was never retired. The caller sends the reader on with `permanentRedirect(sitePath(path))`.
 */
export async function legacyPath(kind: "page" | "help", slug: string): Promise<string | null> {
  return (await getLegacySlug(kind, slug))?.path ?? null;
}

/** `GET /store/v1/help/:slug` (only the leading id of the slug counts); `null` when unknown. */
export async function getHelpArticle(slug: string): Promise<HelpArticleDetail | null> {
  "use cache";
  cacheLife("content");
  cacheTag("store-help");
  return orNull(apiPublicGet<HelpArticleDetail>(`/store/v1/help/${encodeURIComponent(slug)}`));
}

/**
 * The popular searches of the English shop (`GET /store/v1/search/suggest` with an empty `q`): at most 8 phrases, the
 * same for every visitor (the API computes them from distinct visitors and hides what staff hid). `q=` is written into
 * the path because the query builder leaves empty values out. Throws like every read here: callers that must not break
 * use `popularSearches()` (lib/search/popular.ts).
 */
export async function listPopularSearches(): Promise<string[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag("store-search-popular");
  const body = await apiPublicGet<SuggestBody>("/store/v1/search/suggest?q=");
  const popular = Array.isArray(body?.popular) ? body.popular : [];
  return popular.filter((term): term is string => typeof term === "string" && term.trim() !== "").slice(0, 8);
}
