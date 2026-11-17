// In-site addresses. English is the only language (decision 039, 2026-11-16) and every page lives under `/en`: this file
// is the one place that knows the prefix. Safe to import anywhere (server, client, proxy): no server-only APIs here.

/** The prefix of every page of the site. */
export const SITE_PREFIX = "/en";

/** Prefixes an in-site path: `sitePath('/services')` → `/en/services`, `sitePath()` → `/en`. */
export function sitePath(path = "/"): string {
  if (!path.startsWith("/")) path = `/${path}`;
  return path === "/" ? SITE_PREFIX : `${SITE_PREFIX}${path}`;
}
