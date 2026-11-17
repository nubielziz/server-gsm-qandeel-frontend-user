// The site's one language is English (decision 039, 2026-11-16): every page lives under `/en` (`sitePath`,
// lib/site-path.ts), and an old Arabic address answers a permanent redirect to the same path under `/en`
// (next.config.ts). Safe to import anywhere (server, client, proxy): no server-only APIs here.

/** BCP 47 tag for Intl formatters (money, numbers, dates, plural rules, country names). */
export const INTL_LOCALE = "en-US";
