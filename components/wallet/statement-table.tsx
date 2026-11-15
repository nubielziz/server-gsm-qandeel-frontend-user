// StatementTable: the lines of a wallet statement, for both account types (plan D6). Below `md` a compact list (a stacked
// table would be thousands of pixels tall), from `md` up the real table; both copies are in the page, CSS shows one.
// Rows come in one shape (`StatementRow`, lib/wallet/view.ts): the merchant's `memo` and the customer's order label both
// arrive as `details`. Server component, no hooks: the page passes the translated labels.
import { MobileList, type MobileRow } from "@/components/merchant/mobile-list";
import { SignedMoney } from "@/components/merchant/signed-money";
import { Money } from "@/components/ui/money";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { labelOf } from "@/lib/merchant/format";
import type { StatementRow } from "@/lib/wallet/view";

export type StatementTableLabels = {
  /** Accessible name of the table. */
  caption: string;
  columns: { date: string; kind: string; details: string; amount: string; balanceAfter: string };
  /** Translated ledger kinds; a kind that is missing here is shown humanized ("order_hold" → "Order hold"). */
  kinds: Record<string, string>;
  /** What an empty `details` shows. */
  dash: string;
};

export type StatementTableProps = {
  rows: StatementRow[];
  locale: Locale;
  labels: StatementTableLabels;
};

export function StatementTable({ rows, locale, labels }: StatementTableProps) {
  const col = labels.columns;
  const mobileRows = rows.map(
    (row): MobileRow => ({
      key: row.id,
      title: labelOf(labels.kinds, row.kind),
      subtitle: row.details ? (
        <span dir="auto" className="text-ink-muted">
          {row.details}
        </span>
      ) : undefined,
      details: [formatDateTime(row.createdAt, locale)],
      amount: <SignedMoney amount={row.amount} locale={locale} />,
      amountHint: <Money amount={row.balanceAfter} currency="USD" locale={locale} />,
    }),
  );

  return (
    <>
      <MobileList className="md:hidden" rows={mobileRows} />
      <div className="hidden md:block">
        <Table caption={labels.caption}>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{col.date}</TableHeaderCell>
              <TableHeaderCell>{col.kind}</TableHeaderCell>
              <TableHeaderCell>{col.details}</TableHeaderCell>
              <TableHeaderCell numeric>{col.amount}</TableHeaderCell>
              <TableHeaderCell numeric>{col.balanceAfter}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <span className="whitespace-nowrap text-ink-muted">{formatDateTime(row.createdAt, locale)}</span>
                </TableCell>
                <TableCell label={col.kind}>
                  <span className="font-medium">{labelOf(labels.kinds, row.kind)}</span>
                </TableCell>
                <TableCell label={col.details}>
                  <span dir="auto" className="text-ink-muted">
                    {row.details || labels.dash}
                  </span>
                </TableCell>
                <TableCell numeric label={col.amount}>
                  <SignedMoney amount={row.amount} locale={locale} />
                </TableCell>
                <TableCell numeric label={col.balanceAfter}>
                  <Money amount={row.balanceAfter} currency="USD" locale={locale} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
