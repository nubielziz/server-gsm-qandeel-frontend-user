// Finds a service by the slug in the URL. Slugs differ per language and the API has no lookup by id (handoff §5.2,
// trap 16), so a slug of the other language is matched by the service id through the catalog (lib/catalog.ts).
// Shared data only (no cookies): safe to call from metadata and pages.
import { getStoreService } from "@/lib/api/public";
import type { StoreServiceDetail } from "@/lib/api/types";
import { slugForService } from "@/lib/catalog";
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

export async function resolveService(slug: string, locale: Locale, currency = "USD"): Promise<ResolvedService> {
  const own = await getStoreService(slug, { locale, currency });
  if (own) return { kind: "found", service: own };
  const other = otherLocale(locale);
  const foreign = await getStoreService(slug, { locale: other, currency });
  if (!foreign) return { kind: "missing" };
  const mine = await slugForService(foreign.id, locale);
  return mine ? { kind: "redirect", slug: mine } : { kind: "other-language", locale: other, slug };
}
