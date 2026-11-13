// Finds a service by the slug in the URL. Slugs differ per language, so a slug of the other language is followed to this
// language's page through the service's `alternates` (the switched-on pages of the same service in the other
// languages, BH §2.1): no id match over the catalog. A service with no page in this language stays "other-language".
// Shared data only (no cookies): safe to call from metadata and pages.
import { getStoreService } from "@/lib/api/public";
import type { StoreServiceDetail } from "@/lib/api/types";
import type { Locale } from "@/lib/i18n/config";

export type ResolvedService =
  /** The listing exists in this language. */
  | { kind: "found"; service: StoreServiceDetail }
  /** The slug belongs to the other language and this language has a listing of the same service: go to `slug`. */
  | { kind: "redirect"; slug: string }
  /** The service exists only in the other language (`locale`). */
  | { kind: "other-language"; locale: Locale; slug: string }
  | { kind: "missing" };

export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "ar" : "en";
}

/** The slug of the same service in `locale`, from the `alternates` of a page in another language; null when it has none. */
export function alternateSlug(service: Pick<StoreServiceDetail, "alternates">, locale: Locale): string | null {
  // `alternates` is always sent, but the generated type is read defensively like every optional-looking field.
  const match = (service.alternates ?? []).find((alt) => alt.locale === locale && alt.slug);
  return match ? match.slug : null;
}

/**
 * The slugs of the service pages to prerender at build time: the featured services first, then the others (the API's
 * order inside each group), at most `max` (plan D20). Every other slug renders on demand.
 */
export function prerenderSlugs(rows: readonly { slug: string; isFeatured: boolean }[], max: number): string[] {
  const featured = rows.filter((row) => row.isFeatured);
  const others = rows.filter((row) => !row.isFeatured);
  return [...featured, ...others].slice(0, Math.max(0, max)).map((row) => row.slug);
}

export async function resolveService(slug: string, locale: Locale, currency = "USD"): Promise<ResolvedService> {
  const own = await getStoreService(slug, { locale, currency });
  if (own) return { kind: "found", service: own };
  const other = otherLocale(locale);
  const foreign = await getStoreService(slug, { locale: other, currency });
  if (!foreign) return { kind: "missing" };
  const mine = alternateSlug(foreign, locale);
  // `mine === slug` cannot happen (the read above found nothing for it), but a redirect to itself would loop forever.
  return mine && mine !== slug ? { kind: "redirect", slug: mine } : { kind: "other-language", locale: other, slug };
}
