// Who may open a shop checkout, decided from the account and its rank in pure functions (no React, no cookies, no requests), so
// the rule that keeps a merchant rank out of the retail form is unit-tested. The shop checkout is paid first and priced for
// retail buyers (tax, retail price, risk screening). An account of a merchant rank opens the same address and gets its own
// order form there instead, at its own price, paid from its wallet (decision 003): the retail form is never mounted for it, so
// no checkout session is created. The backend refuses the same call with 403 RANK_NOT_ALLOWED, and the form shows a notice
// when that answer comes back.
import { rankKindOf, type RankSource } from "@/lib/account/family";
import { sitePath } from "@/lib/site-path";

/**
 * What the opening page shows:
 * - `guest-form`: nobody is signed in and guest checkout is on: the form with an email field to type.
 * - `sign-in`: nobody is signed in and guest checkout is off: the way to sign in, no form.
 * - `account-form`: a signed-in account of a retail rank (or a rank kind this code does not know): the form with the account's
 *   email locked and its country filled in.
 * - `order-form`: a signed-in account of a merchant rank: its own order form (`POST /client/orders`, paid from its wallet). The
 *   retail form never mounts.
 */
export type CheckoutAccess = "guest-form" | "sign-in" | "account-form" | "order-form";

/**
 * The way into the checkout for this visitor.
 *
 * @param me the signed-in account, or null for a visitor who is signed out
 * @param guestCheckout the shop's switch for checkouts without an account (`policies.guestCheckout`)
 */
export function checkoutAccess(me: RankSource | null | undefined, guestCheckout: boolean): CheckoutAccess {
  if (!me) return guestCheckout ? "guest-form" : "sign-in";
  return rankKindOf(me) === "merchant" ? "order-form" : "account-form";
}

/** The buyer a checkout form is opened for: an account's own email (locked) and country (prefilled). */
export type CheckoutBuyer = { email: string; country: string };

/**
 * The account the form is opened for: the email and country of a signed-in account of a retail rank. Null for a visitor who is
 * signed out and for a merchant rank (it has its own order form, see `checkoutAccess`).
 */
export function checkoutBuyerOf(me: (RankSource & CheckoutBuyer) | null | undefined): CheckoutBuyer | null {
  return me && rankKindOf(me) !== "merchant" ? { email: me.email, country: me.country } : null;
}

/** The checkout address of a service (its shop slug): for a merchant rank it opens the account's own order form. */
export function checkoutHref(slug: string): string {
  return `${sitePath("/checkout")}?service=${encodeURIComponent(slug)}`;
}

/**
 * The notice of a checkout that is already open (`/checkout/<token>`) for an account of a merchant rank. Such a checkout can be
 * opened by a visitor who was signed out; when the same browser is then signed in to an account of a merchant rank, the page
 * tells it up front that the shop checkout is for retail buyers and where it orders at its own price, before the payment
 * choices (the API refuses a merchant rank on its own routes of this checkout, so the page must not let the rank find out
 * only at the pay button).
 *
 * @param me the signed-in account, or null for a visitor who is signed out (or an account that could not be read)
 * @param slug the service's page in the shop, or null when it is no longer listed (there is then no order form to open, and the
 *   way back is the service list)
 * @returns the two addresses the notice needs for a merchant rank (`orderHref` null without a shop page); null for every other
 *   visitor, no notice
 */
export function sessionPriceList(
  me: RankSource | null | undefined,
  slug: string | null,
): { orderHref: string | null; serviceHref: string } | null {
  if (rankKindOf(me) !== "merchant") return null;
  return {
    orderHref: slug ? checkoutHref(slug) : null,
    serviceHref: sitePath(slug ? `/services/${encodeURIComponent(slug)}` : "/services"),
  };
}

/**
 * The sign-in address that comes back to `next` (a path of this site). There is one sign-in page for every account, so no
 * account type is named: the sign-in answer says which rank the account has.
 */
export function checkoutSignInHref(next: string): string {
  return `${sitePath("/sign-in")}?next=${encodeURIComponent(next)}`;
}
