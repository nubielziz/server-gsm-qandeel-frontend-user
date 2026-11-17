// Where to go after sign-in. `?next=` comes from the URL, so it is only trusted when it is a path inside this site:
// it must start with the language segment (`/en/…`). Anything else (another origin, `//host`, a backslash, control
// characters) falls back to a fixed default. An old Arabic address (`/ar/…`: a bookmark, a sign-in redirect from before
// English only, decision 039) is read as the same path under `/en`, where `/ar/…` now redirects anyway.
// Safe to import anywhere.
import { localePath, type Locale } from "@/lib/i18n/config";

const SITE_PATH = /^\/en(?:[/?#]|$)/;
const UNSAFE = /[\\\u0000-\u001f\u007f]/;
const PORTAL_PATH = /^\/en\/merchant(?:\/|$)/;
const ACCOUNT_PATH = /^\/en\/account(?:\/|$)/;
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

/** Which area a sign-in opened: the `kind` of the smart sign-in's answer. */
export type SignInKind = "merchant" | "customer";

/**
 * The path as the browser will resolve it (dot segments folded, percent escapes decoded), or null when it cannot be
 * read. Used to look at WHICH area a `next` points into: `/en/x/../merchant` and `/en/%6Derchant` are the portal.
 */
function resolvedPath(path: string): string | null {
  try {
    return decodeURIComponent(new URL(path, "http://site.invalid").pathname);
  } catch {
    return null;
  }
}

/**
 * Where a visitor lands once signed in (plan D3):
 * - a `next` under `/<lang>/merchant` is honoured only for a merchant;
 * - a `next` under `/<lang>/account` only for a customer;
 * - any other safe same-site path for both;
 * - otherwise the home of the kind (`/<lang>/merchant`, `/<lang>/account`).
 * This stops a loop when a customer signs in on a link that came from the portal (and the other way round).
 */
export function targetAfterSignIn(kind: SignInKind, next: string | null | undefined, locale: Locale): string {
  const home = localePath(locale, kind === "merchant" ? "/merchant" : "/account");
  const target = safeNext(next, home);
  if (target === home) return home;
  // Resolved, a path can land under `/ar` again (`/en/../ar/merchant`): the browser would follow the 308 into `/en`.
  const resolved = resolvedPath(target);
  if (resolved === null) return home;
  const path = englishPath(resolved);
  if (kind === "customer" && PORTAL_PATH.test(path)) return home;
  if (kind === "merchant" && ACCOUNT_PATH.test(path)) return home;
  return target;
}
