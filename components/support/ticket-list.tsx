// TicketList: a signed-in customer's tickets (`/account/tickets`) or a merchant's (`/merchant/support`), newest activity
// first (feature 28). One markup for every screen (speed plan P1.1): a `compact` table is the real table from `md` up and short
// list rows on phones (line 1: number, status; line 2: subject; then the last activity). The number link covers the whole row
// on phones. A row with a reply the visitor has not seen has a dot and says so to screen readers in the link's name.
// Rows do not prefetch: a ticket page is personal and reads the API when it opens, so a prefetch per row would buy nothing
// (and for a customer each read counts against the per-address limit of the ticket token). Server component.
import Link from "next/link";
import type { Ticket } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { statusLabel, type CommonMessages } from "@/lib/i18n/messages/common";
import type { SupportMessages } from "@/lib/i18n/messages/support";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";

/** A row of either list, with the link its number opens (the token page for a customer, the thread for a merchant). */
export type TicketListRow = {
  key: string | number;
  href: string;
  number: string;
  subject: string;
  category: Ticket["category"];
  status: Ticket["status"];
  updatedAt: string;
  lastMessageAt: string | null;
  lastMessageFrom: "you" | "support" | null;
  hasUnread: boolean;
};

export type TicketListProps = {
  rows: readonly TicketListRow[];
  t: Pick<SupportMessages, "list"> & { ticket: Pick<SupportMessages["ticket"], "categories"> };
  c: CommonMessages;
};

export function TicketList({ rows, t, c }: TicketListProps) {
  const col = t.list.columns;
  return (
    <Table compact caption={t.list.caption}>
      <TableHead>
        <TableRow>
          <TableHeaderCell>{col.ticket}</TableHeaderCell>
          <TableHeaderCell>{col.subject}</TableHeaderCell>
          <TableHeaderCell>{col.topic}</TableHeaderCell>
          <TableHeaderCell>{col.status}</TableHeaderCell>
          <TableHeaderCell>{col.activity}</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => {
          const name = fmt(t.list.open, { number: row.number });
          const who = row.lastMessageFrom === "you" ? t.list.youLast : row.lastMessageFrom === "support" ? t.list.supportLast : t.list.noMessages;
          return (
            <TableRow key={row.key} data-ticket-number={row.number}>
              <TableCell phone="title">
                <span className="inline-flex items-center gap-2">
                  {row.hasUnread ? <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-danger" /> : null}
                  <Link
                    href={row.href}
                    prefetch={false}
                    aria-label={row.hasUnread ? `${name} · ${t.list.unread}` : name}
                    className="num font-semibold text-ink hover:underline max-md:after:absolute max-md:after:inset-0"
                  >
                    {row.number}
                  </Link>
                </span>
              </TableCell>
              <TableCell phone="subtitle" label={col.subject} className={row.hasUnread ? "font-semibold text-ink" : "text-ink"}>
                <span className="line-clamp-2 break-words">{row.subject}</span>
              </TableCell>
              <TableCell phone="hide" label={col.topic} className="whitespace-nowrap text-ink-muted">
                {t.ticket.categories[row.category]}
              </TableCell>
              <TableCell phone="badge" label={col.status}>
                <StatusBadge kind="ticket" status={row.status} label={statusLabel(c, "ticket", row.status)} />
              </TableCell>
              <TableCell phone="meta" label={col.activity}>
                <span className="block text-ink-muted max-md:text-ink-subtle">{formatDate(row.lastMessageAt ?? row.updatedAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                <span className="block text-caption text-ink-subtle">{who}</span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
