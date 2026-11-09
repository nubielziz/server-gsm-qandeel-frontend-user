// The cards of the merchant dashboard (mockup "Workspace"). Server components fed with `GET /client/dashboard`.
// Everything is derived from that one answer: no favourites, no notifications (the API has neither).
import Link from "next/link";
import { ChevronRight, ClipboardList, CircleCheck, CircleDashed, Clock, Headset, Package, Wallet, Zap } from "lucide-react";
import { MobileList } from "@/components/merchant/mobile-list";
import { TypeBadge } from "@/components/merchant/type-badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SearchInput } from "@/components/ui/search-input";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import type { MerchantDashboard } from "@/lib/api/types";
import { formatDate, formatNumber } from "@/lib/format";
import { localePath, type Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { statusLabel, type CommonMessages } from "@/lib/i18n/messages/common";
import type { MerchantMessages } from "@/lib/i18n/messages/merchant";

type Props = { data: MerchantDashboard; locale: Locale; t: MerchantMessages; c: CommonMessages };

/** The dark balance card: available balance big, the three figures behind it, and the two ways on. */
export function BalanceCard({ data, locale, t }: Props) {
  const b = t.dashboard.balance;
  const w = data.wallet;
  const line = "flex items-baseline justify-between gap-4 text-body";
  return (
    <StatCard
      tone="inverse"
      icon={<Wallet aria-hidden="true" />}
      label={b.title}
      value={<Money amount={w.available} currency="USD" locale={locale} />}
      hint={b.walletName}
      className="h-full"
    >
      <dl className="grid max-w-sm gap-1.5">
        <div className={line}>
          <dt className="text-on-inverse-muted">{b.balance}</dt>
          <dd className="num font-semibold">
            <Money amount={w.balance} currency="USD" locale={locale} />
          </dd>
        </div>
        <div className={line}>
          <dt className="text-on-inverse-muted">{b.reserved}</dt>
          <dd className="num font-semibold">
            <Money amount={w.reserved} currency="USD" locale={locale} />
          </dd>
        </div>
        <div className={line}>
          <dt className="text-on-inverse-muted">{b.creditLimit}</dt>
          <dd className="num font-semibold">
            <Money amount={w.creditLimit} currency="USD" locale={locale} />
          </dd>
        </div>
      </dl>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
        <ButtonLink href={localePath(locale, "/merchant/wallet/top-up")} variant="inverse">
          {b.addFunds}
        </ButtonLink>
        <Link
          href={localePath(locale, "/merchant/wallet")}
          className="touch-target inline-flex min-h-11 items-center gap-1 rounded-badge font-semibold text-on-inverse underline underline-offset-4 hover:no-underline"
        >
          {b.viewTransactions}
          <ChevronRight aria-hidden="true" className="size-4 rtl:-scale-x-100" />
        </Link>
      </div>
    </StatCard>
  );
}

/** Total, processing, completed and pending (with the rejected count) as four stat cards linking to the filtered orders. */
export function OrderStats({ data, locale, t }: Props) {
  const s = t.dashboard.stats;
  const { counts } = data;
  const total = counts.pending + counts.processing + counts.completed + counts.rejected;
  const orders = localePath(locale, "/merchant/orders");
  const n = (value: number) => formatNumber(value, locale);
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

const SEGMENTS = [
  { key: "completed", tone: "success", swatch: "bg-success" },
  { key: "processing", tone: "warning", swatch: "bg-warning" },
  { key: "pending", tone: "neutral", swatch: "bg-control" },
  { key: "rejected", tone: "danger", swatch: "bg-danger" },
] as const;

/** A stacked bar of the four statuses with the numbers beside it (the bar alone says nothing to a screen reader). */
export function StatusSummary({ data, locale, t, c }: Props) {
  const { counts } = data;
  const total = counts.pending + counts.processing + counts.completed + counts.rejected;
  return (
    <Card>
      <CardBody className="grid gap-4">
        <h2 className="text-heading text-ink">{t.dashboard.summary.title}</h2>
        {total === 0 ? (
          <p className="text-body text-ink-muted">{t.dashboard.summary.empty}</p>
        ) : (
          <>
            <ProgressBar label={t.dashboard.summary.barLabel} segments={SEGMENTS.map((s) => ({ value: counts[s.key], tone: s.tone }))} />
            <ul className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              {SEGMENTS.map((s) => (
                <li key={s.key} className="flex items-start gap-2">
                  <span aria-hidden="true" className={`mt-1.5 size-2.5 shrink-0 rounded-[3px] ${s.swatch}`} />
                  <span>
                    <span className="block text-small text-ink-subtle">{statusLabel(c, "order", s.key)}</span>
                    <span className="num block text-subheading text-ink">{formatNumber(counts[s.key], locale)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/** A search box that starts an order: it goes to the catalog with `?q=`. */
export function QuickOrder({ locale, t }: Omit<Props, "data" | "c">) {
  const q = t.dashboard.quick;
  return (
    <Card>
      <CardBody className="grid gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-card bg-surface-muted [&_svg]:size-5">
            <Zap aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-heading text-ink">{q.title}</h2>
            <p className="text-body text-ink-muted">{q.text}</p>
          </div>
        </div>
        <SearchInput action={localePath(locale, "/merchant/services")} label={q.label} placeholder={q.placeholder} submitLabel={q.submit} />
      </CardBody>
    </Card>
  );
}

export function RecentOrders({ data, locale, t, c }: Props) {
  const r = t.dashboard.recent;
  const rows = data.latestOrders;
  return (
    <Card>
      <CardHeader
        title={r.title}
        actions={
          <ButtonLink href={localePath(locale, "/merchant/orders")} variant="ghost" size="sm" endIcon={<ChevronRight aria-hidden="true" className="rtl:-scale-x-100" />}>
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
          action={<ButtonLink href={localePath(locale, "/merchant/services")}>{r.emptyAction}</ButtonLink>}
        />
      ) : (
        <div className="mt-4">
          <MobileList
            className="md:hidden"
            rows={rows.map((o) => ({
              key: o.id,
              href: localePath(locale, `/merchant/orders/${o.id}`),
              label: fmt(r.open, { id: o.id }),
              title: <span className="num">#{o.id}</span>,
              badge: <StatusBadge kind="order" status={o.status} label={statusLabel(c, "order", o.status)} />,
              subtitle: o.service.name,
              details: [formatDate(o.createdAt, locale), o.imei ? <bdi key="i" dir="ltr" className="num break-all">{o.imei}</bdi> : null].filter(Boolean),
              amount: <Money amount={o.totalPrice} currency={o.currency} locale={locale} />,
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
                    <Link href={localePath(locale, `/merchant/orders/${o.id}`)} aria-label={fmt(r.open, { id: o.id })} className="num font-semibold text-ink hover:underline">
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
                    <Money amount={o.totalPrice} currency={o.currency} locale={locale} />
                  </TableCell>
                  <TableCell label={r.columns.status}>
                    <StatusBadge kind="order" status={o.status} label={statusLabel(c, "order", o.status)} />
                  </TableCell>
                  <TableCell label={r.columns.date}>
                    <span className="whitespace-nowrap text-ink-muted">{formatDate(o.createdAt, locale)}</span>
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

/** Services from the latest orders (newest first, each once) with "Order again". No price: it may have changed. */
export function RecentlyOrdered({ data, locale, t, c }: Props) {
  const a = t.dashboard.again;
  const seen = new Set<number>();
  const services = data.latestOrders.filter((o) => (seen.has(o.service.id) ? false : (seen.add(o.service.id), true)));
  return (
    <Card>
      <CardHeader title={a.title} description={a.text} />
      <CardBody className="pt-2 sm:pt-2">
        {services.length === 0 ? (
          <p className="text-body text-ink-muted">{a.empty}</p>
        ) : (
          <ul className="divide-y divide-line">
            {services.map((o) => (
              <li key={o.service.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                <div className="grid min-w-0 justify-items-start gap-1">
                  <span className="font-semibold text-ink">{o.service.name}</span>
                  <span className="flex flex-wrap items-center gap-2 text-small text-ink-subtle">
                    <TypeBadge type={o.service.type} t={c} />
                    {fmt(a.orderedOn, { date: formatDate(o.createdAt, locale) })}
                  </span>
                </div>
                <ButtonLink href={localePath(locale, `/merchant/services/${o.service.id}`)} size="sm" variant="secondary">
                  {a.orderAgain}
                </ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function HelpCard({ locale, t }: Omit<Props, "data" | "c">) {
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
        <ButtonLink href={localePath(locale, "/help")} variant="secondary">
          {h.action}
        </ButtonLink>
      </div>
    </Card>
  );
}
