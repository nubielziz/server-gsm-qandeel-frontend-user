// StatementTable: the lines of a wallet statement, for both account types (plan D6). One markup for every screen (plan
// P1.1): a `compact` table is the real table from `md` up and short list rows on phones (line 1: kind and amount; line 2:
// details; then date and the balance after as small text), so the page no longer carries a second, phone-only list.
// Rows come in one shape (`StatementRow`, lib/wallet/view.ts): the merchant's `memo` and the customer's order label both
// arrive as `details`. Server component, no hooks: the page passes the translated labels.
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
  return (
    <Table compact caption={labels.caption}>
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
            <TableCell phone="meta">
              <span className="whitespace-nowrap text-ink-muted max-md:text-ink-subtle">{formatDateTime(row.createdAt, locale)}</span>
            </TableCell>
            <TableCell phone="title" label={col.kind}>
              <span className="font-medium max-md:font-semibold">{labelOf(labels.kinds, row.kind)}</span>
            </TableCell>
            <TableCell phone={row.details ? "subtitle" : "hide"} label={col.details}>
              <span dir="auto" className="text-ink-muted max-md:text-ink">
                {row.details || labels.dash}
              </span>
            </TableCell>
            <TableCell numeric phone="amount" label={col.amount}>
              <SignedMoney amount={row.amount} locale={locale} />
            </TableCell>
            <TableCell numeric phone="meta-labeled" label={col.balanceAfter}>
              <Money amount={row.balanceAfter} currency="USD" locale={locale} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
