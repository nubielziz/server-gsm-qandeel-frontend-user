// A merchant call that answers "signed out" (handoff §3.4: any 401, 403 ACCOUNT_SUSPENDED, 403 IP_NOT_ALLOWED) means
// the session is gone. Client forms call `leaveIfSignedOut(error, router)`: it forgets the CSRF token and refreshes
// the route, and the portal layout then sends the visitor to the sign-in page (which comes back to this page).
// ACCOUNT_PENDING_APPROVAL, CSRF_FAILED, 429 and 5xx are NOT sign-outs.
import { forgetCsrf } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";

export function isSignedOutError(error: unknown): boolean {
  return isApiError(error) && (error.status === 401 || error.code === "ACCOUNT_SUSPENDED" || error.code === "IP_NOT_ALLOWED");
}

/** True (after refreshing) when the error means the session ended; the caller then stops handling it. */
export function leaveIfSignedOut(error: unknown, router: { refresh: () => void }): boolean {
  if (!isSignedOutError(error)) return false;
  forgetCsrf("client");
  router.refresh();
  return true;
}
