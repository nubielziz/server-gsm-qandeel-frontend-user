// What a Server Component does with a failed API call. Pages catch errors themselves (a throw would reach the
// language-wide error boundary, which replaces the whole workspace frame), then:
//  - signed out (401, suspended, blocked network) → the sign-in page, which comes back to this page;
//  - a missing record on a detail page → the 404 page;
//  - everything else (including a pending merchant's 403) → an inline notice (components/merchant/page-error.tsx).
import { notFound, redirect } from "next/navigation";
import { isApiError } from "@/lib/api/errors";
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

/** True for `403 ACCOUNT_PENDING_APPROVAL`: a merchant waiting for approval (handoff §4.15). Not a sign-out. */
export function isPendingApproval(error: unknown): boolean {
  return isApiError(error) && error.code === "ACCOUNT_PENDING_APPROVAL";
}

const SIGN_OUT_CODES = new Set(["UNAUTHORIZED", "ACCOUNT_SUSPENDED", "IP_NOT_ALLOWED"]);

/** Redirects or 404s when the error calls for it (handoff §3.4); returns normally for anything the page should show. */
export function routeOnError(error: unknown, options: { next: string; notFoundOn404?: boolean }): void {
  if (!isApiError(error)) return;
  if (error.status === 401 || SIGN_OUT_CODES.has(error.code)) {
    const params = new URLSearchParams({ as: "merchant", next: options.next });
    redirect(`${sitePath("/sign-in")}?${params.toString()}`);
  }
  if (options.notFoundOn404 && error.status === 404) notFound();
}
