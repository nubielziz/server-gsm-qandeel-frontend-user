// Where "Open a new ticket" goes from a closed ticket (owner, 2026-11-15), the `?order=` it carries, and where a ticket the
// visitor just opened is read.
// - A guest on the token page: the public form (`/support`). Its order field takes an order's tracking link, which a
//   ticket does not carry (only the order's id), so the order is not carried there.
// - Any signed-in account: `/account/support/new?order=<id>`. One form serves every rank (decision 002); it preselects the
//   order in its picker (`orderParam`).
// Safe to import anywhere.
import type { AccountFamily } from "@/lib/account/family";
import { sitePath } from "@/lib/site-path";

/** The new-ticket form for a visitor, with the closed ticket's order when the form can take it. */
export function newTicketHref(signedIn: boolean, orderId: number | null): string {
  if (!signedIn) return sitePath("/support");
  const path = sitePath("/account/support/new");
  return orderId !== null && Number.isSafeInteger(orderId) && orderId > 0 ? `${path}?order=${orderId}` : path;
}

/** The order id of `?order=` (a positive whole number), else null. */
export function orderParam(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !/^[1-9]\d{0,15}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

/** What the API answers to a new ticket: a retail account's answer carries the link token, a merchant rank's the id. */
export type CreatedTicket = { token?: string | null; id?: number | null };

/**
 * The page of a ticket the account has just opened, or `null` when the answer holds nothing to open. A retail account (the
 * shop family) reads it on the token page, `/support/tickets/<token>`; a merchant rank (the portal family) in its own thread,
 * `/account/support/<id>`.
 */
export function createdTicketHref(family: AccountFamily, ticket: CreatedTicket): string | null {
  if (family === "store") return ticket.token ? sitePath(`/support/tickets/${encodeURIComponent(ticket.token)}`) : null;
  return typeof ticket.id === "number" && Number.isSafeInteger(ticket.id) && ticket.id > 0
    ? sitePath(`/account/support/${ticket.id}`)
    : null;
}
