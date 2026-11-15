// TopUpsTable: the customer's latest top-ups (`GET /store/v1/me/wallet/top-ups` rows, plan F33). Below `md` a compact list
// (one link per top-up), from `md` up the real table whose first cell is the link; both copies are in the page, CSS shows
// one. Amounts are USD, the amount the customer pays (the top-up's own page shows the fee and what the wallet receives).
// Server component, no hooks: the page passes the translated labels.
import Link from "next/link";
import { MobileList, type MobileRow } from "@/components/merchant/mobile-list";
import { Money } from "@/components/ui/money";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import type { TopUp } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
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
  locale: Locale;
  /** `/en/account/wallet/top-ups`: a row's link is `${hrefBase}/${id}`. */
  hrefBase: string;
  labels: TopUpsTableLabels;
};

export function TopUpsTable({ rows, locale, hrefBase, labels }: TopUpsTableProps) {
  const col = labels.columns;
  const statusOf = (row: TopUp) => <StatusBadge kind="topUp" status={row.status} label={labels.statuses[row.status]} />;
  const mobileRows = rows.map(
    (row): MobileRow => ({
      key: row.id,
      href: `${hrefBase}/${row.id}`,
      label: fmt(labels.view, { number: row.number }),
      title: <bdi dir="ltr">{row.number}</bdi>,
      badge: statusOf(row),
      subtitle: (
        <span dir="auto" className="text-ink-muted">
          {row.method.name}
        </span>
      ),
      details: [formatDate(row.createdAt, locale)],
      amount: <Money amount={row.amount} currency="USD" locale={locale} />,
    }),
  );

  return (
    <>
      <MobileList className="md:hidden" rows={mobileRows} />
      <div className="hidden md:block">
        <Table caption={labels.caption}>
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
                <TableCell label={col.number}>
                  <Link
                    href={`${hrefBase}/${row.id}`}
                    aria-label={fmt(labels.view, { number: row.number })}
                    className="touch-target font-semibold text-ink underline underline-offset-4"
                  >
                    <bdi dir="ltr">{row.number}</bdi>
                  </Link>
                </TableCell>
                <TableCell label={col.date}>
                  <span className="whitespace-nowrap text-ink-muted">{formatDate(row.createdAt, locale)}</span>
                </TableCell>
                <TableCell label={col.method}>
                  <span dir="auto" className="text-ink-muted">
                    {row.method.name}
                  </span>
                </TableCell>
                <TableCell numeric label={col.amount}>
                  <Money amount={row.amount} currency="USD" locale={locale} className="font-semibold" />
                </TableCell>
                <TableCell label={col.status}>{statusOf(row)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
