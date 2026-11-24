// The readable CSRF cookie of an account, whichever name the API gave it. The API names the cookie after the family of the
// account's rank (one name for the portal family, one for the shop family), so code that only asks "is somebody
// signed in?" or "what token do I send?" must accept either name, and the portal name wins when both exist.
// Pure, so the proxy, the server and the browser can import it. Callers hand in a reader of their own: a function from a
// cookie name (a request's cookie jar, a Map) or a cookie header string (`document.cookie`).
import type { AccountFamily } from "@/lib/account/family";

/** The two names, in the order they are read: the first one that is present wins. */
export const ACCOUNT_CSRF_COOKIES = ["csrf_token_client", "csrf_token_store"] as const;

/** A name that tells whether a cookie exists (`(name) => jar.has(name)`), or a cookie header string. */
export type CookieHas = string | ((name: string) => boolean);

/** A name that gives a cookie's value (`(name) => jar.get(name)?.value`), or a cookie header string. */
export type CookieRead = string | ((name: string) => string | null | undefined);

/** One cookie of a header string (`a=1; b=2`), decoded; undefined when absent or empty. */
function fromHeader(header: string, name: string): string | undefined {
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw) || undefined;
    } catch {
      return raw || undefined;
    }
  }
  return undefined;
}

function hasOf(has: CookieHas): (name: string) => boolean {
  return typeof has === "string" ? (name) => fromHeader(has, name) !== undefined : has;
}

/** Whether either account cookie is present. Without one no session can exist, so a caller may skip the API call. */
export function hasAccountCookie(has: CookieHas): boolean {
  const test = hasOf(has);
  return ACCOUNT_CSRF_COOKIES.some((name) => test(name));
}

/** The CSRF token to send: the value of the first account cookie that has one, or undefined when there is none. */
export function accountCsrfFrom(read: CookieRead): string | undefined {
  const get = typeof read === "string" ? (name: string) => fromHeader(read, name) : read;
  for (const name of ACCOUNT_CSRF_COOKIES) {
    const value = get(name);
    if (value) return value;
  }
  return undefined;
}

/**
 * The family the winning cookie belongs to: "client" for the portal name, "store" for the shop name, undefined when
 * neither exists. It tells which "me" route to ask when the account's rank is not known yet; once the answer is in, the
 * rank (`familyOf`) is the source of truth.
 */
export function accountFamilyFromCookies(has: CookieHas): AccountFamily | undefined {
  const test = hasOf(has);
  if (test(ACCOUNT_CSRF_COOKIES[0])) return "client";
  if (test(ACCOUNT_CSRF_COOKIES[1])) return "store";
  return undefined;
}
