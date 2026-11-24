// Where to go after sign-in. `?next=` comes from the URL, so it is only trusted when it is a path inside this site:
// it must start with the language segment (`/en/…`). Anything else (another origin, `//host`, a backslash, control
// characters) falls back to a fixed default. An old Arabic address (`/ar/…`: a bookmark, a sign-in redirect from before
// English only, decision 039) is read as the same path under `/en`, where `/ar/…` now redirects anyway.
// There is one account area, so the target does not depend on who signed in. An old portal address (a bookmark, a link in a
// mail) is written as the page that replaced it. Safe to import anywhere.
import { legacyAccountPath } from "@/lib/account/legacy-paths";
import { sitePath } from "@/lib/site-path";

const SITE_PATH = /^\/en(?:[/?#]|$)/;
const UNSAFE = /[\\\u0000-\u001f\u007f]/;
/** A leading `/ar` that is a whole path segment (`/ar`, `/ar/x`, `/ar?x`, `/ar#x`, never `/arabic`). */
const OLD_ARABIC_PREFIX = /^\/ar(?=$|[/?#])/;

/** The path with a leading `/ar` segment written as `/en` (the 308 of next.config.ts does the same); others unchanged. */
function englishPath(path: string): string {
  return path.replace(OLD_ARABIC_PREFIX, "/en");
}

/**
 * `safeNext("/en/account/orders", "/en/account")` → the path; `safeNext("/ar/account", "/en/account")` → `/en/account`;
 * `safeNext("https://evil.test", "/en/account")` → the fallback.
 */
export function safeNext(raw: string | null | undefined, fallback: string): string {
  if (!raw || raw.length > 2048) return fallback;
  const path = englishPath(raw);
  if (!SITE_PATH.test(path) || UNSAFE.test(path)) return fallback;
  return path;
}

/**
 * The path as the browser will resolve it (dot segments folded, percent escapes decoded) and the query and fragment as
 * written, or null when it cannot be read. Used to look at WHERE a `next` really points: `/en/x/../merchant` and
 * `/en/%6Derchant` are the old portal.
 */
function resolved(path: string): { pathname: string; tail: string } | null {
  try {
    const url = new URL(path, "http://site.invalid");
    return { pathname: decodeURIComponent(url.pathname), tail: `${url.search}${url.hash}` };
  } catch {
    return null;
  }
}

/**
 * Where a visitor lands once signed in:
 * - any safe same-site path is honoured, for every account;
 * - an old portal address (`/en/merchant/orders/7`) or the old ticket list is written as its new page
 *   (`/en/account/orders/7`), with its query and fragment, so a link that came from the old portal does not bounce;
 * - otherwise the account (`/en/account`).
 */
export function targetAfterSignIn(next: string | null | undefined): string {
  const home = sitePath("/account");
  const target = safeNext(next, home);
  if (target === home) return home;
  const where = resolved(target);
  if (where === null) return home;
  // Resolved, a path can land under `/ar` again (`/en/../ar/merchant`): the browser would follow the 308 into `/en`.
  const moved = legacyAccountPath(`${englishPath(where.pathname)}${where.tail}`);
  return moved === null ? target : sitePath(moved);
}
