// Cancel and Verify on an order of a merchant rank (handoff §4.6; shop decision 010): what the sentences next to the buttons say
// and the one flow both the order's page and a row of the orders list run when a button is pressed. No React in here, so
// the rules are tested without a browser. Safe to import in a Client Component (it posts through the browser client).
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import type { OrderActionHints } from "@/lib/api/types";
import { formatDateTime, formatTime } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import type { MerchantMessages } from "@/lib/i18n/messages/merchant";
import { leaveIfSignedOut } from "@/lib/merchant/signed-out";

/** The two actions of an order. */
export type OrderActionKind = "cancel" | "verify";

/** What the API says about the two buttons of an order: today's flags and the four keys of decision 075 (each may be missing). */
export type OrderActionFacts = OrderActionHints & { canCancel: boolean; canVerify: boolean };

/** The sentences under the buttons: null where there is nothing to say. */
export type OrderActionNotes = { cancel: string | null; verify: string | null };

/** The texts `orderActionNotes` reads. */
export type OrderActionNoteLabels = Pick<
  MerchantMessages["order"],
  | "cancelUntilNote"
  | "cancelNotAllowed"
  | "cancelAlreadySent"
  | "cancelInProgress"
  | "verifyUntilNote"
  | "verifyNotCompleted"
  | "verifyWindowPassed"
>;

/** True for an ISO time the formatters can read: a sentence never prints a deadline it cannot show as a time. */
function isTime(value: string | null | undefined): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/**
 * The sentence under Cancel and the one under Verify.
 *
 * - Cancel there, with a deadline (a website order of a service with cancel on waits 2 minutes before it is sent):
 *   "You can cancel until {time}…". There, without a deadline (a manual order): nothing.
 * - Cancel missing: `not_allowed`, `already_sent` and `in_progress` say why; `closed` (the order is finished) says nothing.
 * - Verify there, with a deadline: "You can ask for verification until {date and time}".
 * - Verify missing: `not_completed` and `window_passed` say why; `not_allowed` and `already_requested` say nothing (the
 *   Verification card already shows a request).
 *
 * A key the API did not send (an older backend) is "unknown": it says nothing, and the page shows what it showed before.
 * A button that is there always wins over a reason (the flags are the truth, the reasons only explain).
 *
 * @param facts the order's `canCancel`, `canVerify`, `cancelUntil`, `cancelBlocked`, `verifyUntil` and `verifyBlocked`
 * @param t the texts (`merchant.order`)
 */
export function orderActionNotes(facts: OrderActionFacts, t: OrderActionNoteLabels): OrderActionNotes {
  let cancel: string | null = null;
  if (facts.canCancel) {
    if (isTime(facts.cancelUntil)) cancel = fmt(t.cancelUntilNote, { time: formatTime(facts.cancelUntil) });
  } else if (facts.cancelBlocked === "not_allowed") cancel = t.cancelNotAllowed;
  else if (facts.cancelBlocked === "already_sent") cancel = t.cancelAlreadySent;
  else if (facts.cancelBlocked === "in_progress") cancel = t.cancelInProgress;

  let verify: string | null = null;
  if (facts.canVerify) {
    if (isTime(facts.verifyUntil)) verify = fmt(t.verifyUntilNote, { date: formatDateTime(facts.verifyUntil) });
  } else if (facts.verifyBlocked === "not_completed") verify = t.verifyNotCompleted;
  else if (facts.verifyBlocked === "window_passed") verify = t.verifyWindowPassed;

  return { cancel, verify };
}

/** The API answers that mean "the order moved on since this page was drawn": the page refreshes and the buttons go. */
const STALE = new Set(["ORDER_NOT_OPEN", "ALREADY_SENT", "INVALID_TRANSITION", "ORDER_NOT_COMPLETED"]);

/** The part of the router the flow uses. */
export type OrderActionRouter = { refresh: () => void };

/** What `runOrderAction` needs from the screen it runs on. */
export type OrderActionDeps = {
  router: OrderActionRouter;
  /** The sentence for an API error (the error text and the request id), from `useErrorText()`. */
  errorMessage: (error: unknown) => string;
  /** Shows a success toast (`toast.success`). */
  notify: (title: string, text?: string) => void;
  labels: Pick<MerchantMessages["order"], "cancelled" | "cancelledText" | "verified">;
};

/** How a press ended: `ok`; or failed with the sentence to show, or with `message: null` when the visitor was sent away (signed out). */
export type OrderActionOutcome = { ok: true } | { ok: false; message: string | null };

/**
 * Posts one action of an order and settles the screen: a success toast and `router.refresh()`; a "stale state" answer
 * (ORDER_NOT_OPEN, ALREADY_SENT, INVALID_TRANSITION, ORDER_NOT_COMPLETED) refreshes too, because the order has moved on and
 * its buttons then go; a signed-out or rank answer leaves it to `leaveIfSignedOut` (refresh, the page's own check decides).
 *
 * @param kind `cancel` posts `POST /client/orders/:id/cancel`, `verify` posts `POST /client/orders/:id/verify` (empty body)
 * @param orderId the order
 * @param deps the router, the error text, the toast and the texts of the screen
 * @returns the outcome; it never throws
 */
export async function runOrderAction(kind: OrderActionKind, orderId: number, deps: OrderActionDeps): Promise<OrderActionOutcome> {
  try {
    await api.post(`${FAMILY_ROUTES.client.orders}/${orderId}/${kind}`, {});
  } catch (e) {
    if (leaveIfSignedOut(e, deps.router)) return { ok: false, message: null };
    if (isApiError(e) && STALE.has(e.code)) deps.router.refresh();
    return { ok: false, message: deps.errorMessage(e) };
  }
  if (kind === "cancel") deps.notify(deps.labels.cancelled, deps.labels.cancelledText);
  else deps.notify(deps.labels.verified);
  deps.router.refresh();
  return { ok: true };
}
