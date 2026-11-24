// The order picker of the new-ticket form (`/account/support/new`). A retail account names its orders `SF-12` (as on its emails
// and receipts) and a merchant rank `#12` (as in its portal list), so the name depends on the family. The picker lists the
// account's recent orders; an order older than those, named by `?order=`, is offered by its number alone.
// Pure, so the page and its test share it.
import type { AccountFamily } from "@/lib/account/family";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";

/** What the picker needs of an order, whichever route it was read from. */
export type RecentOrder = { id: number; service: string; createdAt: string };

/** How the family names an order. */
export function orderText(family: AccountFamily, id: number): string {
  return family === "client" ? `#${id}` : `SF-${id}`;
}

/**
 * The options of the picker: the order of `?order=` first when it is not among the recent ones, then each recent order as
 * "name · service · date". `template` is the text of `support.newForm.orderOption`.
 */
export function orderChoices(
  family: AccountFamily,
  orders: readonly RecentOrder[],
  orderId: number | null,
  template: string,
): { id: number; label: string }[] {
  const named =
    orderId !== null && !orders.some((order) => order.id === orderId) ? [{ id: orderId, label: orderText(family, orderId) }] : [];
  return [
    ...named,
    ...orders.map((order) => ({
      id: order.id,
      label: fmt(template, { order: orderText(family, order.id), service: order.service, date: formatDate(order.createdAt) }),
    })),
  ];
}
