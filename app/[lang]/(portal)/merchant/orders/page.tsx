// The merchant's orders (handoff §4.6): status tabs, filters, table, CSV export. Only declared query parameters are
// ever sent (an unknown one is a 422 on list routes).
import { Suspense } from "react";
import Link from "next/link";
import { ClipboardList, FileText, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/container";
import { CsvDownloadButton } from "@/components/merchant/csv-download-button";
import { FilterForm } from "@/components/merchant/filter-form";
import { PageError } from "@/components/merchant/page-error";
import { ListSkeleton } from "@/components/merchant/skeletons";
import { TypeBadge } from "@/components/merchant/type-badge";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { apiSessionList } from "@/lib/api/server";
import type { MerchantOrder } from "@/lib/api/types";
import { formatDate, formatNumber } from "@/lib/format";
import { localePath, type Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { common, statusLabel, type CommonMessages } from "@/lib/i18n/messages/common";
import { merchant, type MerchantMessages } from "@/lib/i18n/messages/merchant";
import { settle } from "@/lib/merchant/load";
import {
  ORDERS_PER_PAGE,
  ORDER_SORTS,
  ORDER_STATUSES,
  SERVICE_TYPES,
  hrefWith,
  ordersExportQuery,
  ordersQuery,
  parseOrdersFilters,
  type SearchParams,
} from "@/lib/merchant/lists";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(merchant);
  return { title: t.orders.title };
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages(merchant)]);
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t.orders.title}
        description={t.orders.description}
        actions={
          <ButtonLink href={localePath(locale, "/merchant/services")} startIcon={<Plus aria-hidden="true" />}>
            {t.orders.newOrder}
          </ButtonLink>
        }
      />
      <Suspense fallback={<ListSkeleton rows={10} />}>
        <Orders searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Orders({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [locale, t, c, sp] = await Promise.all([getLocale(), getMessages(merchant), getMessages(common), searchParams]);
  const filters = parseOrdersFilters(sp);
  const base = localePath(locale, "/merchant/orders");

  const list = await settle(apiSessionList<MerchantOrder>("/client/orders", { query: ordersQuery(filters) }));
  if (!list.ok) return <PageError error={list.error} next={base} />;
  const { data: rows, total } = list.data;

  const carry = {
    type: filters.type,
    q: filters.q,
    from: filters.from,
    to: filters.to,
    sort: filters.sort === "newest" ? undefined : filters.sort,
  };
  const tabs = [
    { key: "", label: t.shared.all, href: hrefWith(base, carry) },
    ...ORDER_STATUSES.map((status) => ({ key: status, label: statusLabel(c, "order", status), href: hrefWith(base, { ...carry, status }) })),
  ];
  const filtered = Boolean(filters.status || filters.type || filters.q || filters.from || filters.to);
  const fieldsActive = Boolean(filters.type || filters.q || filters.from || filters.to || filters.sort !== "newest");

  return (
    <div className="grid gap-4">
      <Tabs label={t.orders.tabsLabel} items={tabs} activeKey={filters.status} variant="pill" />
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <FilterForm
          action={base}
          hidden={{ status: filters.status }}
          label={t.orders.searchLabel}
          applyLabel={t.shared.apply}
          clearLabel={t.shared.clear}
          active={fieldsActive}
          clearHref={hrefWith(base, { status: filters.status })}
        >
          <Input
            type="search"
            name="q"
            label={t.orders.searchLabel}
            labelHidden
            defaultValue={filters.q}
            placeholder={t.orders.searchPlaceholder}
            leading={<Search aria-hidden="true" />}
            fieldClassName="w-full sm:w-72"
            autoComplete="off"
          />
          <Select
            name="type"
            label={t.shared.type}
            labelHidden
            defaultValue={filters.type}
            options={[{ value: "", label: `${t.shared.type}: ${t.shared.all}` }, ...SERVICE_TYPES.map((value) => ({ value, label: (c.serviceType as Record<string, string>)[value] }))]}
            fieldClassName="w-full sm:w-44"
          />
          <Input type="date" name="from" label={t.shared.from} defaultValue={filters.from} fieldClassName="w-[calc(50%-0.375rem)] sm:w-40" max={filters.to || undefined} />
          <Input type="date" name="to" label={t.shared.to} defaultValue={filters.to} fieldClassName="w-[calc(50%-0.375rem)] sm:w-40" min={filters.from || undefined} />
          <Select
            name="sort"
            label={t.shared.sortBy}
            labelHidden
            defaultValue={filters.sort}
            options={ORDER_SORTS.map((value) => ({ value, label: t.orders.sorts[value] }))}
            fieldClassName="w-full sm:w-44"
          />
        </FilterForm>
        <CsvDownloadButton
          path="/client/orders/export"
          fallbackName="orders.csv"
          query={ordersExportQuery(filters)}
          label={t.shared.exportCsv}
          busyLabel={t.shared.exporting}
          failedLabel={t.shared.exportFailed}
        />
      </div>

      <Card>
        {rows.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={<ClipboardList aria-hidden="true" />}
              title={t.orders.emptyFilteredTitle}
              description={t.orders.emptyFilteredText}
              action={
                <ButtonLink href={base} variant="secondary">
                  {t.shared.clear}
                </ButtonLink>
              }
            />
          ) : (
            <EmptyState
              icon={<ClipboardList aria-hidden="true" />}
              title={t.orders.emptyTitle}
              description={t.orders.emptyText}
              action={<ButtonLink href={localePath(locale, "/merchant/services")}>{t.orders.emptyAction}</ButtonLink>}
            />
          )
        ) : (
          <OrdersTable rows={rows} locale={locale} t={t} c={c} />
        )}
      </Card>
      <Pagination total={total} pageSize={ORDERS_PER_PAGE} page={filters.page} basePath={base} searchParams={sp} />
    </div>
  );
}

// One markup for every screen (plan P1.1): a `compact` table is the real table from `md` up and short list rows on phones
// (line 1: number, status, total; line 2: service; then date, input, quantity, check as small text). The number link
// covers the whole row on phones. A value a phone row would show as an empty or default fact (a single unit, no check,
// no input) is dropped there.
function OrdersTable({ rows, locale, t, c }: { rows: MerchantOrder[]; locale: Locale; t: MerchantMessages; c: CommonMessages }) {
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
        {rows.map((o) => {
          const href = localePath(locale, `/merchant/orders/${o.id}`);
          return (
            <TableRow key={o.id}>
              <TableCell phone="title">
                <Link
                  href={href}
                  aria-label={fmt(t.orders.open, { id: o.id })}
                  className="num font-semibold text-ink hover:underline max-md:after:absolute max-md:after:inset-0"
                >
                  #{o.id}
                </Link>
              </TableCell>
              <TableCell phone="meta" label={col.date}>
                <span className="whitespace-nowrap text-ink-muted max-md:text-ink-subtle">{formatDate(o.createdAt, locale)}</span>
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
                {formatNumber(o.quantity, locale)}
              </TableCell>
              <TableCell numeric phone="amount" label={col.total} className="font-semibold">
                <Money amount={o.totalPrice} currency={o.currency} locale={locale} />
              </TableCell>
              <TableCell phone="badge" label={col.status}>
                <StatusBadge kind="order" status={o.status} label={statusLabel(c, "order", o.status)} />
              </TableCell>
              <TableCell phone={o.verificationStatus ? "meta" : "hide"} label={col.verification}>
                {o.verificationStatus ? <Badge tone={o.verificationStatus === "refunded" ? "danger" : o.verificationStatus === "accepted" ? "success" : "warning"}>{verification[o.verificationStatus]}</Badge> : <span className="text-ink-subtle">{t.shared.dash}</span>}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
