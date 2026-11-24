// An API call that answers "signed out" (any 401, 403 ACCOUNT_SUSPENDED, 403 IP_NOT_ALLOWED) means the session is gone.
// Client forms call `leaveIfSignedOut(error, router)`: it forgets the CSRF token and refreshes the route, and the page's
// own session check then sends the visitor to the sign-in page (which comes back to this page).
// 403 RANK_NOT_ALLOWED is not a sign-out: the session is fine but the account's rank does not have this action, so the
// route is refreshed (the server page then answers it, see lib/merchant/load.ts) and the token is kept.
// CSRF_FAILED, 429 and 5xx are NOT sign-outs.
import { forgetCsrf } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";

export function isSignedOutError(error: unknown): boolean {
  return isApiError(error) && (error.status === 401 || error.code === "ACCOUNT_SUSPENDED" || error.code === "IP_NOT_ALLOWED");
}

/** True when the rank does not have the action (403 RANK_NOT_ALLOWED). */
export function isRankRefusal(error: unknown): boolean {
  return isApiError(error) && error.code === "RANK_NOT_ALLOWED";
}

/**
 * True (after refreshing) when the error means the session ended or the rank does not have the page; the caller then stops
 * handling it. A sign-out also forgets the CSRF token; a rank refusal keeps it.
 */
export function leaveIfSignedOut(error: unknown, router: { refresh: () => void }): boolean {
  if (isSignedOutError(error)) {
    forgetCsrf();
    router.refresh();
    return true;
  }
  if (isRankRefusal(error)) {
    router.refresh();
    return true;
  }
  return false;
}
