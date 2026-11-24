// Where a row of an orders list leads, by the family of the account that reads the list. Pure: the lists, the overview and
// the order form's confirmation ask here, so no page builds an order address by hand.
//
// - a retail row opens the tracking page of its token: the token is the credential of that page, so a row without one has
//   no page to open (the rule that guards the tracking page is not weakened by a second way in);
// - a merchant row opens the order's own page in the account area, which only a merchant rank can read.
import { sitePath } from "@/lib/site-path";
import type { AccountFamily } from "./family";

/** The part of a list row the link needs: its id and, on a retail row, the token of its tracking page. */
export type OrderLinkRow = { id: number; trackingToken?: string | null };

/**
 * The address a row of an orders list opens.
 *
 * @param family "client" for a merchant rank, "store" for every other rank (`familyOf(me)`)
 * @param row the list row
 * @returns a merchant row: `/en/account/orders/<id>`; a retail row: `/en/track/<token>` (the token is encoded), or null
 *   when the row has no token
 */
export function orderHref(family: "client", row: OrderLinkRow): string;
export function orderHref(family: AccountFamily, row: OrderLinkRow): string | null;
export function orderHref(family: AccountFamily, row: OrderLinkRow): string | null {
  if (family === "client") return sitePath(`/account/orders/${row.id}`);
  return row.trackingToken ? sitePath(`/track/${encodeURIComponent(row.trackingToken)}`) : null;
}
