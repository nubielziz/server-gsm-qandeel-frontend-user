// TopUpsTable: the customer's latest top-ups (`GET /store/v1/me/wallet/top-ups` rows, plan F33). One markup for every
// screen (plan P1.1): a `compact` table is the real table from `md` up and short list rows on phones (line 1: number,
// status and amount; line 2: method; then the date), with the number link covering the whole row. Amounts are USD, the
// amount the customer pays (the top-up's own page shows the fee and what the wallet receives).
// Server component, no hooks: the page passes the translated labels.
import Link from "next/link";
import { Money } from "@/components/ui/money";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import type { TopUp } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";

export type TopUpsTableLabels = {
  /** Accessible name of the table. */
  caption: string;
  columns: { number: string; date: string; method: string; amount: string; status: string };
  /** "View top-up {number}": the accessible name of a row's link. */
  view: string;
  /** Translated statuses by API value (`common.status.topUp`). */
  statuses: Record<string, string>;
};

export type TopUpsTableProps = {
  rows: TopUp[];
  /** `/en/account/wallet/top-ups`: a row's link is `${hrefBase}/${id}`. */
  hrefBase: string;
  labels: TopUpsTableLabels;
};

export function TopUpsTable({ rows, hrefBase, labels }: TopUpsTableProps) {
  const col = labels.columns;
  return (
    <Table compact caption={labels.caption}>
      <TableHead>
        <TableRow>
          <TableHeaderCell>{col.number}</TableHeaderCell>
          <TableHeaderCell>{col.date}</TableHeaderCell>
          <TableHeaderCell>{col.method}</TableHeaderCell>
          <TableHeaderCell numeric>{col.amount}</TableHeaderCell>
          <TableHeaderCell>{col.status}</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell phone="title" label={col.number}>
              <Link
                href={`${hrefBase}/${row.id}`}
                aria-label={fmt(labels.view, { number: row.number })}
                // `md:touch-target`: from md up the link grows its own hit area to 44px; below md it is the row's stretched link
                // (the `::after` below covers the row, which `touch-target`'s `position: relative` on the link would prevent).
                className="font-semibold text-ink underline underline-offset-4 md:touch-target max-md:no-underline max-md:after:absolute max-md:after:inset-0"
              >
                <bdi dir="ltr">{row.number}</bdi>
              </Link>
            </TableCell>
            <TableCell phone="meta" label={col.date}>
              <span className="whitespace-nowrap text-ink-muted max-md:text-ink-subtle">{formatDate(row.createdAt)}</span>
            </TableCell>
            <TableCell phone="subtitle" label={col.method}>
              <span dir="auto" className="text-ink-muted max-md:text-ink">
                {row.method.name}
              </span>
            </TableCell>
            <TableCell numeric phone="amount" label={col.amount}>
              <Money amount={row.amount} currency="USD" className="font-semibold" />
            </TableCell>
            <TableCell phone="badge" label={col.status}>
              <StatusBadge kind="topUp" status={row.status} label={labels.statuses[row.status]} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
