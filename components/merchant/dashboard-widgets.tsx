// The cards of the merchant dashboard (mockup "Workspace"). Server components fed with `GET /client/dashboard`.
// Everything is derived from that one answer: no favourites, no notifications (the API has neither).
import Link from "next/link";
import { ChevronRight, ClipboardList, CircleCheck, CircleDashed, Clock, Headset, Package, Wallet } from "lucide-react";
import { MobileList } from "@/components/merchant/mobile-list";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import type { MerchantDashboard } from "@/lib/api/types";
import { formatDate, formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { statusLabel, type CommonMessages } from "@/lib/i18n/messages/common";
import type { MerchantMessages } from "@/lib/i18n/messages/merchant";
import { sitePath } from "@/lib/site-path";

type Props = { data: MerchantDashboard; t: MerchantMessages; c: CommonMessages };

/** The dark balance card: available balance big, the three figures behind it, and the two ways on. */
export function BalanceCard({ data, t }: Props) {
  const b = t.dashboard.balance;
  const w = data.wallet;
  const line = "flex items-baseline justify-between gap-4 text-body";
  return (
    <StatCard
      tone="inverse"
      icon={<Wallet aria-hidden="true" />}
      label={b.title}
      value={<Money amount={w.available} currency="USD" />}
      hint={b.walletName}
      className="h-full"
    >
      <dl className="grid max-w-sm gap-1.5">
        <div className={line}>
          <dt className="text-on-inverse-muted">{b.balance}</dt>
          <dd className="num font-semibold">
            <Money amount={w.balance} currency="USD" />
          </dd>
        </div>
        <div className={line}>
          <dt className="text-on-inverse-muted">{b.reserved}</dt>
          <dd className="num font-semibold">
            <Money amount={w.reserved} currency="USD" />
          </dd>
        </div>
        <div className={line}>
          <dt className="text-on-inverse-muted">{b.creditLimit}</dt>
          <dd className="num font-semibold">
            <Money amount={w.creditLimit} currency="USD" />
          </dd>
        </div>
      </dl>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
        <ButtonLink href={sitePath("/merchant/wallet/top-up")} variant="inverse">
          {b.addFunds}
        </ButtonLink>
        <Link
          href={sitePath("/merchant/wallet")}
          className="touch-target inline-flex min-h-11 items-center gap-1 rounded-badge font-semibold text-on-inverse underline underline-offset-4 hover:no-underline"
        >
          {b.viewTransactions}
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </StatCard>
  );
}

/** Total, processing, completed and pending (with the rejected count) as four stat cards linking to the filtered orders. */
export function OrderStats({ data, t }: Props) {
  const s = t.dashboard.stats;
  const { counts } = data;
  const total = counts.pending + counts.processing + counts.completed + counts.rejected;
  const orders = sitePath("/merchant/orders");
  const n = (value: number) => formatNumber(value);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StatCard label={s.total} value={n(total)} hint={s.totalHint} icon={<Package aria-hidden="true" />} href={orders} />
      <StatCard label={s.processing} value={n(counts.processing)} hint={s.processingHint} icon={<CircleDashed aria-hidden="true" />} href={`${orders}?status=processing`} />
      <StatCard label={s.completed} value={n(counts.completed)} hint={s.completedHint} icon={<CircleCheck aria-hidden="true" />} href={`${orders}?status=completed`} />
      <StatCard
        label={s.pending}
        value={n(counts.pending)}
        hint={fmt(s.pendingHint, { count: n(counts.rejected) })}
        icon={<Clock aria-hidden="true" />}
        href={`${orders}?status=pending`}
      />
    </div>
  );
}

export function RecentOrders({ data, t, c }: Props) {
  const r = t.dashboard.recent;
  const rows = data.latestOrders;
  return (
    <Card>
      <CardHeader
        title={r.title}
        actions={
          <ButtonLink href={sitePath("/merchant/orders")} variant="ghost" size="sm" endIcon={<ChevronRight aria-hidden="true" />}>
            {r.viewAll}
          </ButtonLink>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          compact
          icon={<ClipboardList aria-hidden="true" />}
          title={r.emptyTitle}
          description={r.emptyText}
          action={<ButtonLink href={sitePath("/merchant/services")}>{r.emptyAction}</ButtonLink>}
        />
      ) : (
        <div className="mt-4">
          <MobileList
            className="md:hidden"
            rows={rows.map((o) => ({
              key: o.id,
              href: sitePath(`/merchant/orders/${o.id}`),
              label: fmt(r.open, { id: o.id }),
              title: <span className="num">#{o.id}</span>,
              badge: <StatusBadge kind="order" status={o.status} label={statusLabel(c, "order", o.status)} />,
              subtitle: o.service.name,
              details: [formatDate(o.createdAt), o.imei ? <bdi key="i" dir="ltr" className="num break-all">{o.imei}</bdi> : null].filter(Boolean),
              amount: <Money amount={o.totalPrice} currency={o.currency} />,
            }))}
          />
          <div className="hidden md:block">
          <Table caption={r.caption}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{r.columns.order}</TableHeaderCell>
                <TableHeaderCell>{r.columns.service}</TableHeaderCell>
                <TableHeaderCell>{r.columns.input}</TableHeaderCell>
                <TableHeaderCell numeric>{r.columns.price}</TableHeaderCell>
                <TableHeaderCell>{r.columns.status}</TableHeaderCell>
                <TableHeaderCell>{r.columns.date}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={sitePath(`/merchant/orders/${o.id}`)} aria-label={fmt(r.open, { id: o.id })} className="num font-semibold text-ink hover:underline">
                      #{o.id}
                    </Link>
                  </TableCell>
                  <TableCell label={r.columns.service}>
                    <span className="font-medium text-ink">{o.service.name}</span>
                  </TableCell>
                  <TableCell label={r.columns.input}>
                    {o.imei ? (
                      <bdi dir="ltr" title={o.imei} className="num block max-w-[13rem] truncate">
                        {o.imei}
                      </bdi>
                    ) : (
                      <span className="text-ink-subtle">{t.shared.dash}</span>
                    )}
                  </TableCell>
                  <TableCell numeric label={r.columns.price} className="font-semibold">
                    <Money amount={o.totalPrice} currency={o.currency} />
                  </TableCell>
                  <TableCell label={r.columns.status}>
                    <StatusBadge kind="order" status={o.status} label={statusLabel(c, "order", o.status)} />
                  </TableCell>
                  <TableCell label={r.columns.date}>
                    <span className="whitespace-nowrap text-ink-muted">{formatDate(o.createdAt)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </div>
      )}
    </Card>
  );
}

export function HelpCard({ t }: Omit<Props, "data" | "c">) {
  const h = t.dashboard.help;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-card bg-surface-muted [&_svg]:size-6">
            <Headset aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-subheading text-ink">{h.title}</h2>
            <p className="text-body text-ink-muted">{h.text}</p>
          </div>
        </div>
        <ButtonLink href={sitePath("/help")} variant="secondary">
          {h.action}
        </ButtonLink>
      </div>
    </Card>
  );
}
