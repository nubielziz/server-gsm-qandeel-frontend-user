// The language of the site. English is the only one (decision 039, 2026-11-16): every page lives under `/en`, and an old
// Arabic address answers a permanent redirect to the same path under `/en` (next.config.ts). `Locale` and the `locale`
// arguments that carry it stay until the cleanup wave of feature 30 removes them.
// Safe to import anywhere (server, client, proxy): no server-only APIs here.

export type Locale = "en";

/** BCP 47 tag for Intl formatters (money, numbers, dates, plural rules). */
const INTL_LOCALES: Record<Locale, string> = { en: "en-US" };

export function intlLocaleOf(locale: Locale): string {
  return INTL_LOCALES[locale];
}

/** Prefixes an in-site path with the language: `localePath('en', '/services')` → `/en/services`. */
export function localePath(locale: Locale, path = "/"): string {
  if (!path.startsWith("/")) path = `/${path}`;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}
