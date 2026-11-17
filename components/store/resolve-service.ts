// Finds a service by the slug in the URL: one read of the service page (`GET /store/v1/services/:slug`). A slug the API
// does not know may be an old address (the page of a retired Arabic listing, decision 039): only then one more read,
// `GET /store/v1/legacy-slugs/service/:slug`, says where the service is now (plan 30 §7.1). Both reads are cached and
// shared (no cookies): safe to call from metadata and pages. The callers send the reader on with `permanentRedirect`;
// on a page that streams it arrives as an instant redirect inside a 200 answer, and the page's metadata is `noindex`
// then (anything but `found` is).
import { getLegacySlug, getStoreService } from "@/lib/api/public";
import type { StoreServiceDetail } from "@/lib/api/types";

export type ResolvedService =
  /** The service has a page under this slug. */
  | { kind: "found"; service: StoreServiceDetail }
  /**
   * The slug is an old address of a service. `slug` is the service's page on sale now, or null when it has none; `path`
   * is where the reader goes (no language prefix): `/services/<slug>`, else the service list `/services`.
   */
  | { kind: "redirect"; slug: string | null; path: string }
  /** No page has this slug and it was never one: a 404. */
  | { kind: "missing" };

/**
 * The slugs of the service pages to prerender at build time: the featured services first, then the others (the API's
 * order inside each group), at most `max` (plan D20). Every other slug renders on demand.
 */
export function prerenderSlugs(rows: readonly { slug: string; isFeatured: boolean }[], max: number): string[] {
  const featured = rows.filter((row) => row.isFeatured);
  const others = rows.filter((row) => !row.isFeatured);
  return [...featured, ...others].slice(0, Math.max(0, max)).map((row) => row.slug);
}

/** The service of the URL's slug, priced in `currency`: found, an old address to follow, or missing. */
export async function resolveService(slug: string, currency = "USD"): Promise<ResolvedService> {
  const service = await getStoreService(slug, { currency });
  if (service) return { kind: "found", service };
  const legacy = await getLegacySlug("service", slug);
  if (!legacy) return { kind: "missing" };
  // The page that was just not found cannot be where the reader goes: following it would loop (two caches out of step).
  if (legacy.slug === slug) return { kind: "missing" };
  return { kind: "redirect", slug: legacy.slug, path: legacy.path };
}
