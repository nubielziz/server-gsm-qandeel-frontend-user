// The rows of the Support list. A retail account's tickets come from the shop routes and each has a token; a merchant rank's
// come from the portal routes and have only an id (the session is the credential). The two kinds of row open different
// pages, so the link is the one thing that differs: everything else is copied as it is.
// Pure, so the list page and its test share it.
import type { ClientTicketRow, MyTicketRow } from "@/lib/api/types";
import { sitePath } from "@/lib/site-path";
import type { TicketListRow } from "@/components/support/ticket-list";

/** The fields both kinds of row have. */
function shared(row: MyTicketRow | ClientTicketRow) {
  return {
    number: row.number,
    subject: row.subject,
    category: row.category,
    status: row.status,
    updatedAt: row.updatedAt,
    lastMessageAt: row.lastMessageAt,
    lastMessageFrom: row.lastMessageFrom,
    hasUnread: row.hasUnread,
  };
}

/** A retail account's rows: the list hands out each ticket's token, so a row opens the token page and needs no emailed link. */
export function storeTicketRows(rows: readonly MyTicketRow[]): TicketListRow[] {
  return rows.map((row) => ({
    key: row.token,
    href: sitePath(`/support/tickets/${encodeURIComponent(row.token)}`),
    ...shared(row),
  }));
}

/** A merchant rank's rows: a row opens the live thread of the account area, addressed by the ticket's id. */
export function clientTicketRows(rows: readonly ClientTicketRow[]): TicketListRow[] {
  return rows.map((row) => ({
    key: row.id,
    href: sitePath(`/account/support/${row.id}`),
    ...shared(row),
  }));
}
