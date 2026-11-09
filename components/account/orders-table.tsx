// OrdersTable: the customer's orders (`GET /store/v1/me/orders` rows). Below 768px every row becomes a small card.
// Amounts follow the API exactly: `totalPrice` is USD BEFORE VAT, `taxAmount` is the VAT, and `currency` is only the
// code the customer paid in. The column is labelled "USD, before VAT" and the paid-in currency is shown in words, so
// no number is presented as something it is not. Server component.
import { ArrowUpRight } from "lucide-react";
import type { CustomerOrder } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { localePath } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { account } from "@/lib/i18n/messages/account";
import { common, statusLabel } from "@/lib/i18n/messages/common";
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

export async function OrdersTable({ orders, compact }: OrdersTableProps) {
  const [locale, t, c] = await Promise.all([getLocale(), getMessages(account), getMessages(common)]);
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
                  <Money amount={order.totalPrice} currency="USD" locale={locale} className="font-semibold text-ink" />
                  {hasVat ? (
                    <span className="block text-caption text-ink-subtle">
                      {t.orders.vat} <Money amount={order.taxAmount} currency="USD" locale={locale} className="text-caption" />
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
                {formatDate(order.createdAt, locale)}
              </TableCell>
              <TableCell role="cell" className="md:text-end">
                {order.trackingToken ? (
                  <ButtonLink
                    href={localePath(locale, `/track/${encodeURIComponent(order.trackingToken)}`)}
                    variant="secondary"
                    size="sm"
                    endIcon={<ArrowUpRight aria-hidden="true" className="rtl:-scale-x-100" />}
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
