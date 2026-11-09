// Languages of the site. The API knows exactly these two (`en`, `ar`: backend src/modules/storefront/domain/locales.ts).
// Safe to import anywhere (server, client, proxy): no server-only APIs here.

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Cookie that remembers the visitor's language for plain links (emails, bookmarks) that carry no `/en` or `/ar`. */
export const LOCALE_COOKIE = "gsm_locale";

/** Cookie that remembers the shop currency (ISO 4217) chosen in the header switcher. */
export const CURRENCY_COOKIE = "gsm_currency";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * BCP 47 tag for Intl formatters. Arabic keeps Latin digits (`nu-latn`): prices, IMEIs and order numbers stay
 * readable and match what customers type.
 */
export function intlLocaleOf(locale: Locale): string {
  return locale === "ar" ? "ar-JO-u-nu-latn" : "en-US";
}

/** Prefixes an in-site path with the language: `localePath('ar', '/services')` → `/ar/services`. */
export function localePath(locale: Locale, path = "/"): string {
  if (!path.startsWith("/")) path = `/${path}`;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** The same page in another language: swaps the leading `/en` or `/ar` of a pathname. */
export function switchLocalePath(pathname: string, to: Locale): string {
  const parts = pathname.split("/");
  if (isLocale(parts[1])) {
    parts[1] = to;
    return parts.join("/") || `/${to}`;
  }
  return localePath(to, pathname);
}
