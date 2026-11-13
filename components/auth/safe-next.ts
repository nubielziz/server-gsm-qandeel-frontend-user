// Where to go after sign-in. `?next=` comes from the URL, so it is only trusted when it is a path inside this site:
// it must start with a supported language segment (`/en/…`, `/ar/…`). Anything else (another origin, `//host`, a
// backslash, control characters) falls back to a fixed default. Safe to import anywhere.
import { localePath, type Locale } from "@/lib/i18n/config";

const SITE_PATH = /^\/(?:en|ar)(?:[/?#]|$)/;
const UNSAFE = /[\\\u0000-\u001f\u007f]/;
const PORTAL_PATH = /^\/(?:en|ar)\/merchant(?:\/|$)/;
const ACCOUNT_PATH = /^\/(?:en|ar)\/account(?:\/|$)/;

/** `safeNext("/en/account/orders", "/en/account")` → the path; `safeNext("https://evil.test", "/en/account")` → the fallback. */
export function safeNext(raw: string | null | undefined, fallback: string): string {
  if (!raw || raw.length > 2048) return fallback;
  if (!SITE_PATH.test(raw) || UNSAFE.test(raw)) return fallback;
  return raw;
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
  const path = resolvedPath(target);
  if (path === null) return home;
  if (kind === "customer" && PORTAL_PATH.test(path)) return home;
  if (kind === "merchant" && ACCOUNT_PATH.test(path)) return home;
  return target;
}
