// What a Server Component does with a failed API call. Pages catch errors themselves (a throw would reach the
// language-wide error boundary, which replaces the whole workspace frame), then:
//  - signed out (401, suspended, blocked network) → the sign-in page, which comes back to this page;
//  - a rank refusal (403 RANK_NOT_ALLOWED: the account's rank does not have this page) → the account home, which every
//    account has. It is never a sign-out. On the account home itself it shows the inline notice instead, so the page cannot
//    redirect to itself;
//  - a missing record on a detail page → the 404 page;
//  - everything else → an inline notice (components/merchant/page-error.tsx).
import { notFound, redirect } from "next/navigation";
import { isApiError } from "@/lib/api/errors";
import { signInPath } from "@/lib/api/session";
import { sitePath } from "@/lib/site-path";

export type Settled<T> = { ok: true; data: T } | { ok: false; error: unknown };

/** Awaits a call and returns its result or its error, never throwing. */
export async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}

const SIGN_OUT_CODES = new Set(["UNAUTHORIZED", "ACCOUNT_SUSPENDED", "IP_NOT_ALLOWED"]);

/** True when `next` is the account home itself (its query, fragment and a final slash ignored). */
function isAccountHome(next: string | undefined): boolean {
  if (!next) return false;
  const path = next.split(/[?#]/)[0].replace(/\/+$/, "");
  return path === sitePath("/account");
}

/**
 * Redirects or 404s when the error calls for it; returns normally for anything the page should show. `next` is the page's
 * own address, the place the sign-in page comes back to.
 */
export function routeOnError(error: unknown, options: { next?: string; notFoundOn404?: boolean }): void {
  if (!isApiError(error)) return;
  if (error.status === 401 || SIGN_OUT_CODES.has(error.code)) redirect(signInPath(options.next));
  if (error.code === "RANK_NOT_ALLOWED" && !isAccountHome(options.next)) redirect(sitePath("/account"));
  if (options.notFoundOn404 && error.status === 404) notFound();
}
