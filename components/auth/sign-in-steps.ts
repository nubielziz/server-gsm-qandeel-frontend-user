// The decisions of the sign-in flow, apart from the React state that carries them, so each one has a unit test: which step an
// answer asks for, when a pending session has ended, and what to tell about the claim of guest orders. Pure: no API calls.
import { ApiError, isApiError } from "@/lib/api/errors";
import type { SignInResult } from "@/lib/api/types";
import type { PendingDetails } from "@/lib/api/types";
import { plural, type PluralForms } from "@/lib/i18n/define";
import type { LinkExchangeAnswer } from "./auth-requests";
import { readPendingDetails } from "./pending-details";

/** The steps of the sign-in page. `link` is the landing of an emailed link (`?token=`). */
export type SignInStep = "password" | "magic" | "totp" | "new-password" | "link";

/** What to do with a sign-in answer: finish (go to the target), ask for the code, or ask for a new password. */
export type SignInMove = "finish" | "totp" | "new-password";

/**
 * The move a password sign-in asks for. `done` finishes, `totp` wants the code, `password` wants a new password in place of
 * a temporary one. Any other word is refused instead of guessed.
 * @throws ApiError `INVALID_RESPONSE` for an answer with no known step
 */
export function moveAfterSignIn(result: Pick<SignInResult, "next"> | null | undefined): SignInMove {
  switch (result?.next) {
    case "done":
      return "finish";
    case "totp":
      return "totp";
    case "password":
      return "new-password";
    default:
      throw new ApiError({ status: 200, code: "INVALID_RESPONSE", title: "Unexpected sign-in step" });
  }
}

/** The move after the sign-in link was exchanged (`next` is `done` or `totp`; the exchange refuses anything else). */
export function moveAfterLink(answer: Pick<LinkExchangeAnswer, "next">): "finish" | "totp" {
  return answer.next === "totp" ? "totp" : "finish";
}

/** The move after a temporary password was replaced: the code step when two-step sign-in is on, else finish. */
export function moveAfterPasswordChange(next: "totp" | "done"): "finish" | "totp" {
  return next === "totp" ? "totp" : "finish";
}

/**
 * True when a failed step call means the pending session ended (10 minutes): the page goes back to the form with a sentence.
 * A wrong code is a 422 on `code`, never a 401, so this never hides a typing mistake.
 */
export function pendingSessionEnded(error: unknown): boolean {
  return isApiError(error) && error.status === 401;
}

/** One sentence about the claim of guest orders, and its tone. */
export type ClaimLine = { tone: "success" | "warning"; text: string };

/** The strings of the claim lines (`auth.signIn.link`). */
export type ClaimStrings = { claimed: PluralForms; claimBusy: string };

/**
 * What to tell after the sign-in link was exchanged: how many guest orders were added when there were some, and the line for
 * a claim that gave up because another request held a record it needs (`claimSkipped: "busy"`). Nothing to tell gives an
 * empty list and the page goes straight on.
 */
export function claimLines(answer: Pick<LinkExchangeAnswer, "claimedOrders" | "claimSkipped">, t: ClaimStrings): ClaimLine[] {
  const lines: ClaimLine[] = [];
  if (answer.claimedOrders > 0) lines.push({ tone: "success", text: plural(answer.claimedOrders, t.claimed) });
  if (answer.claimSkipped === "busy") lines.push({ tone: "warning", text: t.claimBusy });
  return lines;
}

/** What the page tells after the link was exchanged, before it goes on: the claim lines, the next move, whose account it is. */
export type LinkOutcomeState = {
  lines: ClaimLine[];
  move: "finish" | "totp";
  /** The masked address of the account the link opened, when the link was not asked for in this browser; else null. */
  openedFor: string | null;
  /**
   * The details of a sign-up whose link was opened in another browser than the one that filled the form (the answer carries
   * `pendingDetails`): the account exists and is signed in, nothing was applied, and the page shows the "finish your account" form
   * with these details to confirm or change and an empty password box. Null for every other link.
   */
  pending: PendingDetails | null;
};

/**
 * The details to confirm on the "finish your account" form, or null when there are none to confirm: `passwordSet: true` (this
 * browser sent the form: everything was applied), a link of any other kind (neither key), or an answer whose `pendingDetails` is
 * not four strings. `passwordSet: false` alone, with no details, is not enough to ask for anything.
 */
export function pendingDetailsOf(answer: Pick<LinkExchangeAnswer, "passwordSet" | "pendingDetails">): PendingDetails | null {
  if (answer.passwordSet === true) return null;
  return readPendingDetails(answer.pendingDetails);
}

/**
 * Whose account to name after the link was exchanged. A link asked for in this browser needs no word (the reader typed that
 * address). A link asked for elsewhere (forwarded, or opened on another device) signs the reader into someone else's account
 * without a sign, so the page names it and offers to sign out. Null when there is nothing to name.
 */
export function openedAccount(answer: Pick<LinkExchangeAnswer, "requestedHere" | "maskedEmail">): string | null {
  if (answer.requestedHere === true) return null;
  return answer.maskedEmail ? answer.maskedEmail : null;
}

/**
 * What to show after the sign-in link was exchanged. Null when there is nothing to tell (no claim line, the link was asked
 * for here, and no sign-up details wait to be confirmed): the page goes straight on.
 */
export function outcomeAfterLink(
  answer: Pick<
    LinkExchangeAnswer,
    "next" | "claimedOrders" | "claimSkipped" | "requestedHere" | "maskedEmail" | "passwordSet" | "pendingDetails"
  >,
  t: ClaimStrings,
): LinkOutcomeState | null {
  const lines = claimLines(answer, t);
  const openedFor = openedAccount(answer);
  const pending = pendingDetailsOf(answer);
  if (lines.length === 0 && openedFor === null && pending === null) return null;
  return { lines, move: moveAfterLink(answer), openedFor, pending };
}
