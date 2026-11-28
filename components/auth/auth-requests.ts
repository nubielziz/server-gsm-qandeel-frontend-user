// Every call the sign-in, sign-up and email-link pages make, in one place, so each page and each test names the same route.
// The routes are the account routes of lib/account/routes.ts: one table for every rank. Browser only (the calls go through the
// browser client, which sets the cookies of the session). Each function throws an ApiError for a refused call.
import { ACCOUNT_ROUTES } from "@/lib/account/routes";
import { api } from "@/lib/api/browser";
import { ApiError } from "@/lib/api/errors";
import type { PostClientAuthPasswordChangeResponse, PostStoreV1AuthVerifyResponse } from "@/lib/api/schema.gen";
import type { AccountMe, PendingDetails, SignUpFinishInput, SignUpInput } from "@/lib/api/types";
import { readPendingDetails } from "./pending-details";

/**
 * What the page reads of the answer to a sign-in link: the step still to do, what the claim of guest orders did, and whose
 * account the link opened (`requestedHere` is true when this browser asked for the link; `maskedEmail` is the account's address
 * with its middle hidden). A link that came from a sign-up (backend decision 079) says more, by two keys typed here by hand so the
 * code compiles before and after the generated types carry them: `passwordSet: true` when this browser sent the form (the details
 * and the password were applied), and `passwordSet: false` with `pendingDetails` when the link was opened in another browser (the
 * account exists and is signed in, NOTHING of the form was applied: the details are handed back, never the password, for the person
 * who proved the mailbox to confirm or correct them). Neither key: an ordinary sign-in.
 */
export type LinkExchangeAnswer = Pick<
  PostStoreV1AuthVerifyResponse,
  "next" | "claimedOrders" | "claimSkipped" | "requestedHere" | "maskedEmail"
> & { passwordSet?: boolean; pendingDetails?: PendingDetails };

/**
 * Exchanges the token of an emailed sign-in link for a session. `claimGuestOrders` is the box of the page: when true the
 * backend moves the orders a guest placed with this (now proven) address onto the account. The answer's `next` is
 * `totp` when two-step sign-in still wants a code and `done` otherwise; `claimedOrders` counts the orders moved and
 * `claimSkipped` is `busy` when the claim gave up (the sign-in itself still worked). `requestedHere` is false and `maskedEmail`
 * names the account when the link was not asked for in this browser, so the page can say whose account it opened.
 * An answer that leaves them out counts as "not asked for here" with no address (nothing to show). `passwordSet` is passed on only
 * when it is a boolean, and `pendingDetails` only when it holds four strings: a missing key means "nothing to say".
 *
 * @param token the `token` of the link
 * @param claimGuestOrders whether the box was ticked
 * @returns the step to do next and the outcome of the claim
 * @throws ApiError 410 for a link that is spent or expired
 */
export async function exchangeSignInLink(token: string, claimGuestOrders: boolean): Promise<LinkExchangeAnswer> {
  const answer = await api.post<LinkExchangeAnswer | undefined>(ACCOUNT_ROUTES.linkSignIn, { token, claimGuestOrders });
  if (!answer || (answer.next !== "totp" && answer.next !== "done")) {
    throw new ApiError({ status: 200, code: "INVALID_RESPONSE", title: "Unexpected sign-in step" });
  }
  const pending = readPendingDetails(answer.pendingDetails);
  return {
    next: answer.next,
    claimedOrders: answer.claimedOrders ?? 0,
    requestedHere: answer.requestedHere === true,
    maskedEmail: typeof answer.maskedEmail === "string" ? answer.maskedEmail : "",
    ...(answer.claimSkipped ? { claimSkipped: answer.claimSkipped } : {}),
    ...(typeof answer.passwordSet === "boolean" ? { passwordSet: answer.passwordSet } : {}),
    ...(pending ? { pendingDetails: pending } : {}),
  };
}

/**
 * Asks for a sign-in link by email (the same answer for every address). The link signs in an account that exists: an address
 * without an account is mailed a note with the sign-up address instead, and no account is created.
 */
export async function requestSignInLink(email: string, turnstileToken: string): Promise<void> {
  await api.post<void>(ACCOUNT_ROUTES.linkRequest, { email }, { turnstileToken });
}

/**
 * Sends the sign-up form: `POST /store/v1/auth/sign-up` with the Turnstile token (the same CSRF handling as the other sign-in
 * routes). The answer is 204 for every valid body, whether or not the address already has an account, so the page never says
 * which. The mailed link makes the account on the confirm page: opened in this browser it applies the details and sets the
 * password at once; opened in another browser it asks the person to confirm the details and choose the password (`finishSignUp`).
 *
 * @param body every key is required (see `SignUpInput`)
 * @throws ApiError 422 naming the field (`password` carries the password policy's code), 429 when asked too often
 */
export async function requestSignUp(body: SignUpInput, turnstileToken: string): Promise<void> {
  await api.post<void>(ACCOUNT_ROUTES.signUp, body, { turnstileToken });
}

/**
 * Finishes an account that a sign-up link made in another browser (`POST /store/v1/auth/sign-up/finish`): the signed-in person
 * confirms the four details and chooses the password, with the rules of sign-up. The browser client adds the session's CSRF
 * token. The answer is the account's own view; nothing in it is needed, so the page just goes on.
 *
 * @param body the four details and the password (see `SignUpFinishInput`)
 * @returns the account's own view, when the answer carries one
 * @throws ApiError 422 naming the field (`password` carries the password policy's code), 409 when the account already has a
 * password, 401 when the session ended, 429 when asked too often
 */
export async function finishSignUp(body: SignUpFinishInput): Promise<AccountMe | undefined> {
  return api.post<AccountMe | undefined>(ACCOUNT_ROUTES.signUpFinish, body);
}

/** Asks for a password link by email: one route and one answer for every account and every address. */
export async function requestPasswordLink(email: string, turnstileToken: string): Promise<void> {
  await api.post<void>(ACCOUNT_ROUTES.forgotPassword, { email }, { turnstileToken });
}

/**
 * Sets the password named by an emailed link (a reset or an invitation). It signs nobody in and ends every session.
 * @throws ApiError 410 for a link that is spent or expired, 422 `WEAK_PASSWORD` (the link stays usable)
 */
export async function setPasswordFromLink(token: string, password: string): Promise<void> {
  await api.post<void>(ACCOUNT_ROUTES.resetPassword, { token, password });
}

/** Marks the address of an emailed link as verified. It never signs anyone in. @throws ApiError 410 for a spent or expired link */
export async function verifyEmailAddress(token: string): Promise<void> {
  await api.post<void>(ACCOUNT_ROUTES.verifyEmail, { token });
}

/** The second step of a two-step sign-in. @throws ApiError 401 when the pending session ended, 422 for a wrong code */
export async function submitTotpCode(code: string): Promise<void> {
  await api.post<void>(ACCOUNT_ROUTES.totp, { code });
}

/**
 * The forced change of a temporary password, for every account. The answer says whether a code is still wanted.
 * @returns `totp` when two-step sign-in wants a code next, `done` when the account is signed in
 * @throws ApiError 401 when the pending session ended, 422 for a weak password
 */
export async function changeTemporaryPassword(password: string): Promise<PostClientAuthPasswordChangeResponse["next"]> {
  const result = await api.post<PostClientAuthPasswordChangeResponse | undefined>(ACCOUNT_ROUTES.forcedPasswordChange, {
    password,
  });
  if (result?.next === "totp" || result?.next === "done") return result.next;
  throw new ApiError({ status: 200, code: "INVALID_RESPONSE", title: "Unexpected password step" });
}
