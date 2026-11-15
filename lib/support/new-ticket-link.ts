// Where "Open a new ticket" goes from a closed ticket (owner, 2026-11-15), and the `?order=` it carries.
// - A guest on the token page: the public form (`/support`). Its order field takes an order's tracking link, which a
//   ticket does not carry (only the order's id), so the order is not carried there.
// - A signed-in customer (the token page opened from "My tickets" or while signed in): `/account/tickets/new?order=<id>`.
// - A merchant: `/merchant/support/new?order=<id>`.
// The two signed-in forms preselect the order in their picker (`orderParam`). Safe to import anywhere.
import { localePath, type Locale } from "@/lib/i18n/config";

/** Who is writing: decides which new-ticket form opens. */
export type TicketSurface = "guest" | "customer" | "merchant";

/** The new-ticket form for `surface`, with the closed ticket's order when the form can take it. */
export function newTicketHref(locale: Locale, surface: TicketSurface, orderId: number | null): string {
  if (surface === "guest") return localePath(locale, "/support");
  const path = localePath(locale, surface === "customer" ? "/account/tickets/new" : "/merchant/support/new");
  return orderId !== null && Number.isSafeInteger(orderId) && orderId > 0 ? `${path}?order=${orderId}` : path;
}

/** The order id of `?order=` (a positive whole number), else null. */
export function orderParam(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !/^[1-9]\d{0,15}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}
