// The service slugs prerendered at build time, shared by the two routes that show one service from its slug: the service
// page (`/[lang]/services/[slug]`) and the quick view dialog (`@modal/(.)quick-view/[slug]`). Their content then joins
// the static output, so a prefetch of either is served from it instead of a server render (plan P3.3).
import { allListedServices } from "@/lib/catalog";
import { getLocale } from "@/lib/i18n/server";
import { prerenderSlugs } from "./resolve-service";
import { staticSlugParams } from "./static-params";

/** At most this many services per language are prerendered: a build through the shop host stays under its request limit. */
export const MAX_STATIC_SLUGS = 50;

/**
 * `generateStaticParams` of a route under `[lang]` with a `[slug]` service segment: the featured services first, then
 * the API's order (plan D20), at most `MAX_STATIC_SLUGS`. Every other slug renders on demand; an unreachable API at
 * build time leaves only the placeholder (`staticSlugParams`).
 */
export async function serviceStaticParams(): Promise<{ slug: string }[]> {
  try {
    const rows = await allListedServices(await getLocale());
    return staticSlugParams(prerenderSlugs(rows, MAX_STATIC_SLUGS));
  } catch {
    // The API is unreachable at build time: every service page renders on demand instead.
    return staticSlugParams([]);
  }
}
