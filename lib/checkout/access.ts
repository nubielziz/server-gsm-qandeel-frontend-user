// Who may open a shop checkout, decided from the account and its rank in pure functions (no React, no cookies, no requests), so
// the rule that keeps a merchant rank out of the retail form is unit-tested. The shop checkout is paid first and priced for
// retail buyers (tax, retail price, risk screening); an account of a merchant rank orders from its own price list instead
// (decision 002). Never mounting the form for it is the first line: no checkout session is created. The backend refuses the
// same call with 403 RANK_NOT_ALLOWED, and the form shows the same card when that answer comes back.
import { rankKindOf, type RankSource } from "@/lib/account/family";
import { sitePath } from "@/lib/site-path";

/**
 * What the opening page shows:
 * - `guest-form`: nobody is signed in and guest checkout is on: the form with an email field to type.
 * - `sign-in`: nobody is signed in and guest checkout is off: the way to sign in, no form.
 * - `account-form`: a signed-in account of a retail rank (or a rank kind this code does not know): the form with the account's
 *   email locked and its country filled in.
 * - `price-list`: a signed-in account of a merchant rank: a notice that leads to the price list. The form never mounts.
 */
export type CheckoutAccess = "guest-form" | "sign-in" | "account-form" | "price-list";

/**
 * The way into the checkout for this visitor.
 *
 * @param me the signed-in account, or null for a visitor who is signed out
 * @param guestCheckout the shop's switch for checkouts without an account (`policies.guestCheckout`)
 */
export function checkoutAccess(me: RankSource | null | undefined, guestCheckout: boolean): CheckoutAccess {
  if (!me) return guestCheckout ? "guest-form" : "sign-in";
  return rankKindOf(me) === "merchant" ? "price-list" : "account-form";
}

/** The buyer a checkout form is opened for: an account's own email (locked) and country (prefilled). */
export type CheckoutBuyer = { email: string; country: string };

/**
 * The account the form is opened for: the email and country of a signed-in account of a retail rank. Null for a visitor who is
 * signed out and for a merchant rank (it has no form at all, see `checkoutAccess`).
 */
export function checkoutBuyerOf(me: (RankSource & CheckoutBuyer) | null | undefined): CheckoutBuyer | null {
  return me && rankKindOf(me) !== "merchant" ? { email: me.email, country: me.country } : null;
}

/** The page of the account's price list where the service is ordered at the account's own price (a merchant rank only). */
export function priceListHref(serviceId: number): string {
  return sitePath(`/account/services/${serviceId}`);
}

/**
 * The price-list notice of a checkout that is already open (`/checkout/<token>`). Such a checkout can be opened by a visitor who
 * was signed out; when the same browser is then signed in to an account of a merchant rank, the page tells it up front that the
 * shop checkout is for retail buyers and where it orders at its own price, before the payment choices (the API refuses a merchant
 * rank on its own routes of this checkout, so the page must not let the rank find out only at the pay button).
 *
 * @param me the signed-in account, or null for a visitor who is signed out (or an account that could not be read)
 * @param serviceId the checkout's service (its page in the price list)
 * @param slug the service's page in the shop, or null when it is no longer listed (the way back is then the service list)
 * @returns the two addresses the notice needs for a merchant rank; null for every other visitor, no notice
 */
export function sessionPriceList(
  me: RankSource | null | undefined,
  serviceId: number,
  slug: string | null,
): { priceListHref: string; serviceHref: string } | null {
  if (rankKindOf(me) !== "merchant") return null;
  return {
    priceListHref: priceListHref(serviceId),
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
