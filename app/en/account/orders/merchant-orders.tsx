// The orders of a merchant rank (handoff §4.6): status tabs, filters, table, CSV export. Only declared query parameters are
// ever sent (an unknown one is a 422 on list routes). Rows open the order's own page (lib/account/order-href.ts). Server
// component.
import { ClipboardList, Plus, Search } from "lucide-react";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { apiSessionList } from "@/lib/api/server";
import type { MerchantOrder } from "@/lib/api/types";
import { sitePath } from "@/lib/site-path";
import { common, statusLabel } from "@/lib/i18n/messages/common";
import { merchant } from "@/lib/i18n/messages/merchant";
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
import { MerchantOrdersTable } from "@/components/account/orders-table";
import { PageHeader } from "@/components/layout/container";
import { CsvDownloadButton } from "@/components/merchant/csv-download-button";
import { FilterForm } from "@/components/merchant/filter-form";
import { PageError } from "@/components/merchant/page-error";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { TabPanel, Tabs } from "@/components/ui/tabs";

export async function MerchantOrders({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const t = merchant;
  const c = common;
  const filters = parseOrdersFilters(sp);
  const base = sitePath("/account/orders");
  const header = (
    <PageHeader
      title={t.orders.title}
      description={t.orders.description}
      actions={
        <ButtonLink href={sitePath("/services")} startIcon={<Plus aria-hidden="true" />}>
          {t.orders.newOrder}
        </ButtonLink>
      }
    />
  );

  const list = await settle(apiSessionList<MerchantOrder>(FAMILY_ROUTES.client.orders, { query: ordersQuery(filters) }));
  if (!list.ok) {
    return (
      <div className="grid gap-6">
        {header}
        <PageError error={list.error} next={base} />
      </div>
    );
  }
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
    ...ORDER_STATUSES.map((status) => ({
      key: status,
      label: statusLabel(c, "order", status),
      href: hrefWith(base, { ...carry, status }),
    })),
  ];
  const filtered = Boolean(filters.status || filters.type || filters.q || filters.from || filters.to);
  const fieldsActive = Boolean(filters.type || filters.q || filters.from || filters.to || filters.sort !== "newest");

  return (
    <div className="grid gap-6">
      {header}
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
              options={[
                { value: "", label: `${t.shared.type}: ${t.shared.all}` },
                ...SERVICE_TYPES.map((value) => ({ value, label: (c.serviceType as Record<string, string>)[value] })),
              ]}
              fieldClassName="w-full sm:w-44"
            />
            <Input
              type="date"
              name="from"
              label={t.shared.from}
              defaultValue={filters.from}
              fieldClassName="w-[calc(50%-0.375rem)] sm:w-40"
              max={filters.to || undefined}
            />
            <Input
              type="date"
              name="to"
              label={t.shared.to}
              defaultValue={filters.to}
              fieldClassName="w-[calc(50%-0.375rem)] sm:w-40"
              min={filters.from || undefined}
            />
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
            path={`${FAMILY_ROUTES.client.orders}/export`}
            fallbackName="orders.csv"
            query={ordersExportQuery(filters)}
            label={t.shared.exportCsv}
            busyLabel={t.shared.exporting}
            failedLabel={t.shared.exportFailed}
          />
        </div>

        <TabPanel activeKey={filters.status}>
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
                  action={<ButtonLink href={sitePath("/services")}>{t.orders.emptyAction}</ButtonLink>}
                />
              )
            ) : (
              <MerchantOrdersTable rows={rows} />
            )}
          </Card>
        </TabPanel>
        <Pagination total={total} pageSize={ORDERS_PER_PAGE} page={filters.page} basePath={base} searchParams={sp} />
      </div>
    </div>
  );
}
