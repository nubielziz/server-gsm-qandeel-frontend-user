// The two orders tables of the account area. The shapes of the rows differ by kind (a retail row carries VAT and a tracking
// token, a merchant row carries the input, the quantity and the verification), so there is one table for each:
// - OrdersTable: a retail account's orders (`GET /store/v1/me/orders` rows). Below 768px every row becomes a small card.
//   Amounts follow the API exactly: `totalPrice` is USD BEFORE VAT, `taxAmount` is the VAT, and `currency` is only the
//   code the customer paid in. The column is labelled "USD, before VAT" and the paid-in currency is shown in words, so
//   no number is presented as something it is not.
// - MerchantOrdersTable: a merchant rank's orders (`GET /client/orders` rows), one markup for every screen.
// Where a row leads is decided in lib/account/order-href.ts. Server components.
import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";
import { orderHref } from "@/lib/account/order-href";
import type { CustomerOrder, MerchantOrder } from "@/lib/api/types";
import { formatDate, formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { account } from "@/lib/i18n/messages/account";
import { common, statusLabel } from "@/lib/i18n/messages/common";
import { merchant } from "@/lib/i18n/messages/merchant";
import { TypeBadge } from "@/components/merchant/type-badge";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";

export type OrdersTableProps = {
  orders: CustomerOrder[];
  /** The overview shows fewer columns (no details, no quantity). */
  compact?: boolean;
};

/** `SF-<id>`: how an order is named on emails and receipts. */
export function orderLabel(id: number): string {
  return `SF-${id}`;
}

export function OrdersTable({ orders, compact }: OrdersTableProps) {
  const t = account;
  const c = common;
  const col = t.orders.columns;

  // Explicit roles: below 768px the stacked table is `display: block`, which drops the native table semantics.
  return (
    <Table stacked caption={t.orders.tableLabel} role="table">
      <TableHead role="rowgroup">
        <tr role="row">
          <TableHeaderCell role="columnheader">{col.order}</TableHeaderCell>
          <TableHeaderCell role="columnheader">{col.service}</TableHeaderCell>
          {compact ? null : <TableHeaderCell role="columnheader">{col.input}</TableHeaderCell>}
          {compact ? null : <TableHeaderCell role="columnheader" numeric>{col.quantity}</TableHeaderCell>}
          <TableHeaderCell role="columnheader" numeric>{col.amount}</TableHeaderCell>
          <TableHeaderCell role="columnheader">{col.status}</TableHeaderCell>
          <TableHeaderCell role="columnheader">{col.date}</TableHeaderCell>
          <TableHeaderCell role="columnheader">
            <span className="sr-only">{col.track}</span>
          </TableHeaderCell>
        </tr>
      </TableHead>
      <TableBody role="rowgroup">
        {orders.map((order) => {
          const hasVat = Number(order.taxAmount) > 0;
          const trackHref = orderHref("store", order);
          return (
            <TableRow key={order.id} role="row">
              <TableCell role="cell" label={col.order} className="num whitespace-nowrap font-semibold text-ink">
                {orderLabel(order.id)}
              </TableCell>
              <TableCell role="cell" label={col.service} className="min-w-40 font-medium text-ink">
                {order.service.name}
              </TableCell>
              {compact ? null : (
                <TableCell role="cell" label={col.input} className="num text-ink-muted">
                  <span dir="ltr">{order.imei || t.orders.noInput}</span>
                </TableCell>
              )}
              {compact ? null : (
                <TableCell role="cell" label={col.quantity} numeric>
                  {order.quantity}
                </TableCell>
              )}
              <TableCell role="cell" label={col.amount} numeric>
                <div className="text-end">
                  <Money amount={order.totalPrice} currency="USD" className="font-semibold text-ink" />
                  {hasVat ? (
                    <span className="block text-caption text-ink-subtle">
                      {t.orders.vat} <Money amount={order.taxAmount} currency="USD" className="text-caption" />
                    </span>
                  ) : null}
                  {order.currency !== "USD" ? (
                    <span className="block text-caption text-ink-subtle">{fmt(t.orders.paidIn, { currency: order.currency })}</span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell role="cell" label={col.status}>
                <StatusBadge kind="order" status={order.status} label={statusLabel(c, "order", order.status)} />
              </TableCell>
              <TableCell role="cell" label={col.date} className="whitespace-nowrap text-ink-muted">
                {formatDate(order.createdAt)}
              </TableCell>
              <TableCell role="cell" className="md:text-end">
                {trackHref ? (
                  <ButtonLink
                    href={trackHref}
                    variant="secondary"
                    size="sm"
                    endIcon={<ArrowUpRight aria-hidden="true" />}
                    aria-label={fmt(t.orders.trackOrder, { id: orderLabel(order.id) })}
                  >
                    {t.orders.track}
                  </ButtonLink>
                ) : (
                  <span className="text-small text-ink-subtle">{t.orders.noTracking}</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * The orders of a merchant rank (`GET /client/orders` rows). One markup for every screen: a `compact` table is the real
 * table from `md` up and short list rows on phones (line 1: number, status, total; line 2: service; then date, input,
 * quantity and check as small text). The number link covers the whole row on phones. A value a phone row would show as an
 * empty or default fact (a single unit, no check, no input) is dropped there.
 */
export function MerchantOrdersTable({ rows }: { rows: MerchantOrder[] }) {
  const t = merchant;
  const c = common;
  const col = t.orders.columns;
  const verification = t.orders.verification as Record<string, string>;
  return (
    <Table compact caption={t.orders.caption}>
      <TableHead>
        <TableRow>
          <TableHeaderCell>{col.order}</TableHeaderCell>
          <TableHeaderCell>{col.date}</TableHeaderCell>
          <TableHeaderCell>{col.service}</TableHeaderCell>
          <TableHeaderCell>{col.input}</TableHeaderCell>
          <TableHeaderCell numeric>{col.quantity}</TableHeaderCell>
          <TableHeaderCell numeric>{col.total}</TableHeaderCell>
          <TableHeaderCell>{col.status}</TableHeaderCell>
          <TableHeaderCell>{col.verification}</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((o) => (
          <TableRow key={o.id}>
            <TableCell phone="title">
              <Link
                href={orderHref("client", o)}
                aria-label={fmt(t.orders.open, { id: o.id })}
                className="num font-semibold text-ink hover:underline max-md:after:absolute max-md:after:inset-0"
              >
                #{o.id}
              </Link>
            </TableCell>
            <TableCell phone="meta" label={col.date}>
              <span className="whitespace-nowrap text-ink-muted max-md:text-ink-subtle">{formatDate(o.createdAt)}</span>
            </TableCell>
            <TableCell phone="subtitle" label={col.service}>
              <div className="grid min-w-0 justify-items-start gap-1 text-start">
                <span className="font-medium text-ink">{o.service.name}</span>
                <span className="max-md:hidden">
                  <TypeBadge type={o.service.type} t={c} />
                </span>
              </div>
            </TableCell>
            <TableCell phone={o.imei || o.inputFileId ? "meta" : "hide"} label={col.input}>
              {o.imei ? (
                <bdi dir="ltr" title={o.imei} className="num block max-w-[13rem] truncate">
                  {o.imei}
                </bdi>
              ) : o.inputFileId ? (
                <span className="inline-flex items-center gap-1.5 text-ink-muted max-md:text-ink-subtle">
                  <FileText aria-hidden="true" className="size-4" />
                  {t.orders.file}
                </span>
              ) : (
                <span className="text-ink-subtle">{t.shared.dash}</span>
              )}
            </TableCell>
            <TableCell numeric phone={o.quantity > 1 ? "meta-labeled" : "hide"} label={col.quantity}>
              {formatNumber(o.quantity)}
            </TableCell>
            <TableCell numeric phone="amount" label={col.total} className="font-semibold">
              <Money amount={o.totalPrice} currency={o.currency} />
            </TableCell>
            <TableCell phone="badge" label={col.status}>
              <StatusBadge kind="order" status={o.status} label={statusLabel(c, "order", o.status)} />
            </TableCell>
            <TableCell phone={o.verificationStatus ? "meta" : "hide"} label={col.verification}>
              {o.verificationStatus ? (
                <Badge
                  tone={o.verificationStatus === "refunded" ? "danger" : o.verificationStatus === "accepted" ? "success" : "warning"}
                >
                  {verification[o.verificationStatus]}
                </Badge>
              ) : (
                <span className="text-ink-subtle">{t.shared.dash}</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
