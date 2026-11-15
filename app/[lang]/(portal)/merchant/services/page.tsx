// Service catalog with the merchant's own prices (handoff §4.4). The header is static; the filters, table and export
// stream behind <Suspense> because they depend on the search params and the session.
import { Suspense } from "react";
import Link from "next/link";
import { PackageSearch, Search } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/container";
import { FilterForm } from "@/components/merchant/filter-form";
import { CsvDownloadButton } from "@/components/merchant/csv-download-button";
import { PageError } from "@/components/merchant/page-error";
import { ListSkeleton } from "@/components/merchant/skeletons";
import { TypeBadge } from "@/components/merchant/type-badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { apiSessionList } from "@/lib/api/server";
import { listQuery } from "@/lib/api/query";
import type { MerchantService } from "@/lib/api/types";
import { localePath, type Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { common, type CommonMessages } from "@/lib/i18n/messages/common";
import { merchant, type MerchantMessages } from "@/lib/i18n/messages/merchant";
import { formatNumber } from "@/lib/format";
import { formatMinutes } from "@/lib/merchant/format";
import {
  SERVICES_PER_PAGE,
  SERVICE_SORTS,
  SERVICE_TYPES,
  hrefWith,
  parseServicesFilters,
  pricesExportQuery,
  servicesQuery,
  type SearchParams,
} from "@/lib/merchant/lists";
import { quantityRule } from "@/lib/merchant/order-input";
import { settle } from "@/lib/merchant/load";
import { PageTransition } from "@/components/layout/page-transition";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(merchant);
  return { title: t.catalog.title };
}

export default async function ServicesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getMessages(merchant);
  return (
    <PageTransition>
      <div className="grid gap-6">
        <PageHeader title={t.catalog.title} description={t.catalog.description} />
        <Suspense fallback={<ListSkeleton rows={10} />}>
          <Catalog searchParams={searchParams} />
        </Suspense>
      </div>
    </PageTransition>
  );
}

function quantityText(s: MerchantService, t: MerchantMessages["catalog"], locale: Locale): string {
  const rule = quantityRule(s);
  const n = (value: number) => formatNumber(value, locale);
  if (rule.kind === "fixed") return fmt(t.qtyFixed, { n: n(rule.value) });
  if (rule.kind === "range") return fmt(t.qtyRange, { min: n(rule.min), max: n(rule.max) });
  return fmt(t.qtyOptions, { list: rule.options.map(n).join(", ") });
}

async function Catalog({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [locale, t, c, sp] = await Promise.all([getLocale(), getMessages(merchant), getMessages(common), searchParams]);
  const filters = parseServicesFilters(sp);
  const base = localePath(locale, "/merchant/services");

  const [list, everything] = await Promise.all([
    settle(apiSessionList<MerchantService>("/client/services", { query: servicesQuery(filters) })),
    // The category filter lists every category the merchant can see (one call, up to 1000 rows; the type tab narrows it).
    settle(
      apiSessionList<MerchantService>("/client/services", {
        query: listQuery({ start: 0, end: 1000, sort: ["category", "name"], order: ["asc", "asc"] }, { type: filters.type || undefined }),
      }),
    ),
  ]);
  if (!list.ok) return <PageError error={list.error} next={base} />;

  const categories = new Map<number, string>();
  if (everything.ok) for (const s of everything.data.data) if (!categories.has(s.category.id)) categories.set(s.category.id, s.category.name);

  const { data: rows, total } = list.data;
  const filtered = Boolean(filters.q || filters.type || filters.categoryId);
  const tabHref = (type: string) => hrefWith(base, { q: filters.q, categoryId: filters.categoryId, sort: filters.sort === "category" ? undefined : filters.sort, type });
  const tabs = [
    { key: "", label: t.shared.all, href: tabHref("") },
    ...SERVICE_TYPES.map((type) => ({ key: type, label: (c.serviceType as Record<string, string>)[type], href: tabHref(type) })),
  ];

  return (
    <div className="grid gap-4">
      <Tabs label={t.catalog.typeLabel} items={tabs} activeKey={filters.type} variant="pill" />
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <FilterForm
          action={base}
          hidden={{ type: filters.type }}
          label={t.catalog.searchLabel}
          applyLabel={t.shared.apply}
          clearLabel={t.shared.clear}
          active={Boolean(filters.q || filters.categoryId)}
          clearHref={hrefWith(base, { type: filters.type })}
        >
          <Input
            type="search"
            name="q"
            label={t.catalog.searchLabel}
            labelHidden
            defaultValue={filters.q}
            placeholder={t.catalog.searchPlaceholder}
            leading={<Search aria-hidden="true" />}
            fieldClassName="w-full sm:w-72"
            autoComplete="off"
          />
          <Select
            name="categoryId"
            label={t.catalog.category}
            labelHidden
            defaultValue={filters.categoryId}
            options={[{ value: "", label: t.catalog.allCategories }, ...Array.from(categories, ([value, label]) => ({ value: String(value), label }))]}
            fieldClassName="w-full sm:w-48"
          />
          <Select
            name="sort"
            label={t.shared.sortBy}
            labelHidden
            defaultValue={filters.sort}
            options={SERVICE_SORTS.map((value) => ({ value, label: `${t.shared.sortBy}: ${t.catalog.sorts[value]}` }))}
            fieldClassName="w-full sm:w-48"
          />
        </FilterForm>
        <CsvDownloadButton
          path="/client/prices/export"
          fallbackName="prices.csv"
          query={pricesExportQuery(filters)}
          label={t.catalog.exportPrices}
          busyLabel={t.shared.exporting}
          failedLabel={t.shared.exportFailed}
        />
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<PackageSearch aria-hidden="true" />}
            title={filtered ? t.catalog.emptyTitle : t.catalog.emptyCatalogTitle}
            description={filtered ? t.catalog.emptyText : t.catalog.emptyCatalogText}
            action={filtered ? <ButtonLink href={base} variant="secondary">{t.shared.clear}</ButtonLink> : undefined}
          />
        ) : (
          <ServicesTable rows={rows} locale={locale} t={t} c={c} />
        )}
      </Card>
      <Pagination total={total} pageSize={SERVICES_PER_PAGE} page={filters.page} basePath={base} searchParams={sp} />
    </div>
  );
}

// One markup for every screen (plan P1.1): a `compact` table is the real table from `md` up and short list rows on
// phones (line 1: name and price; line 2: type; then category, delivery and quantity as small text). The name link covers
// the whole row on phones, where the "Order" button column is dropped.
function ServicesTable({ rows, locale, t, c }: { rows: MerchantService[]; locale: Locale; t: MerchantMessages; c: CommonMessages }) {
  const col = t.catalog.columns;
  return (
    <Table compact caption={t.catalog.caption}>
      <TableHead>
        <TableRow>
          <TableHeaderCell>{col.service}</TableHeaderCell>
          <TableHeaderCell>{col.category}</TableHeaderCell>
          <TableHeaderCell>{col.type}</TableHeaderCell>
          <TableHeaderCell numeric>{col.price}</TableHeaderCell>
          <TableHeaderCell>{col.delivery}</TableHeaderCell>
          <TableHeaderCell>{col.quantity}</TableHeaderCell>
          <TableHeaderCell>
            <span className="sr-only">{t.shared.actions}</span>
          </TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((s) => (
          <ServiceRow key={s.id} s={s} locale={locale} t={t} c={c} />
        ))}
      </TableBody>
    </Table>
  );
}

function ServiceRow({ s, locale, t, c }: { s: MerchantService; locale: Locale; t: MerchantMessages; c: CommonMessages }) {
  const href = localePath(locale, `/merchant/services/${s.id}`);
  const col = t.catalog.columns;
  const delivery = s.slaMinutes > 0 ? formatMinutes(s.slaMinutes, locale) : s.deliveryTime;
  return (
    <TableRow>
      <TableCell phone="title">
        <div className="min-w-0 text-start">
          <Link href={href} className="font-semibold text-ink hover:underline max-md:after:absolute max-md:after:inset-0">
            {s.name}
          </Link>
          <p className="text-small text-ink-subtle max-md:hidden">
            <bdi dir="ltr">{s.code}</bdi>
          </p>
        </div>
      </TableCell>
      <TableCell phone="meta" label={col.category}>
        {s.category.name}
      </TableCell>
      <TableCell phone="subtitle" label={col.type}>
        <TypeBadge type={s.type} t={c} />
      </TableCell>
      <TableCell numeric phone="amount" label={col.price} className="font-semibold">
        <Money amount={s.price} currency={s.currency} locale={locale} />
      </TableCell>
      <TableCell phone={delivery ? "meta" : "hide"} label={col.delivery}>
        {delivery || t.shared.dash}
      </TableCell>
      <TableCell phone="meta-labeled" label={col.quantity}>
        <span className="num">{quantityText(s, t.catalog, locale)}</span>
      </TableCell>
      <TableCell phone="hide">
        <ButtonLink href={href} size="sm" variant="secondary" aria-label={fmt(t.catalog.orderService, { name: s.name })}>
          {t.catalog.order}
        </ButtonLink>
      </TableCell>
    </TableRow>
  );
}
