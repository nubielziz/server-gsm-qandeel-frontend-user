// The catalog: search, filters (brand, carrier, country), sort, 24 per page. The page shell is static; everything that
// depends on the URL (`searchParams`) or on the visitor's currency cookie streams in behind one <Suspense>.
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PackageSearch, SlidersHorizontal, X } from "lucide-react";
import { Container, PageHeader } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DialogTrigger, Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { CatalogFilters, type CatalogFilterLabels } from "@/components/store/catalog-filters";
import { serviceCardLabels } from "@/components/store/card-labels";
import { firstParam, withoutParams, type SearchParams } from "@/components/store/search-params";
import { ServiceCard, ServiceGridSkeleton } from "@/components/store/service-card";
import { listStoreServices } from "@/lib/api/public";
import { pageRange, parsePage } from "@/lib/api/query";
import { catalogFacets } from "@/lib/catalog";
import { countryName } from "@/lib/countries";
import { getCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format";
import { localePath } from "@/lib/i18n/config";
import { fmt, plural } from "@/lib/i18n/define";
import { common } from "@/lib/i18n/messages/common";
import { store } from "@/lib/i18n/messages/store";
import { getLocale, getMessages } from "@/lib/i18n/server";

const PER_PAGE = 24;

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getMessages(store)]);
  return {
    title: t.catalog.title,
    description: t.catalog.metaDescription,
    alternates: { canonical: localePath(locale, "/services"), languages: { en: "/en/services", ar: "/ar/services" } },
  };
}

export default async function ServicesPage(props: PageProps<"/[lang]/services">) {
  const [locale, t] = await Promise.all([getLocale(), getMessages(store)]);
  return (
    <Container className="py-8 lg:py-10">
      <PageHeader
        eyebrow={
          <Breadcrumbs
            label={t.catalog.breadcrumbLabel}
            items={[{ label: t.catalog.breadcrumbHome, href: localePath(locale) }, { label: t.catalog.title }]}
          />
        }
        title={t.catalog.title}
        description={t.catalog.description}
      />
      <Suspense fallback={<CatalogSkeleton />}>
        <Catalog searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}

async function Catalog({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const [locale, t, c, currency] = await Promise.all([getLocale(), getMessages(store), getMessages(common), getCurrency()]);

  const q = firstParam(params.q);
  const brand = firstParam(params.brand);
  const network = firstParam(params.network);
  const country = firstParam(params.country, 2).toUpperCase();
  const sort = firstParam(params.sort) === "title" ? "title" : "featured";
  const page = parsePage(params.page);
  const { start, end } = pageRange(page, PER_PAGE);
  const basePath = localePath(locale, "/services");

  const [list, facets] = await Promise.all([
    listStoreServices({
      locale,
      currency: currency.code,
      q: q || undefined,
      brand: brand || undefined,
      network: network || undefined,
      country: country || undefined,
      sort: sort === "title" ? "title" : undefined,
      start,
      end,
    }),
    catalogFacets(locale),
  ]);

  // A page number past the end (an old link): go to the last page instead of an empty list.
  if (list.data.length === 0 && list.total > 0 && page > 1) {
    redirect(pageHref(basePath, params, Math.ceil(list.total / PER_PAGE)));
  }

  const filtered = Boolean(q || brand || network || country);
  const labels: CatalogFilterLabels = {
    search: t.catalog.search,
    searchPlaceholder: t.catalog.searchPlaceholder,
    brand: t.catalog.brand,
    network: t.catalog.network,
    country: t.catalog.country,
    allBrands: t.catalog.allBrands,
    allNetworks: t.catalog.allNetworks,
    allCountries: t.catalog.allCountries,
    sort: t.catalog.sort,
    sortFeatured: t.catalog.sortFeatured,
    sortTitle: t.catalog.sortTitle,
    apply: t.catalog.apply,
    clear: t.catalog.clear,
  };
  const filterProps = { action: basePath, locale, values: { q, brand, network, country, sort } as const, facets, labels };

  const chips: { key: string; label: string; href: string }[] = [];
  if (q) chips.push({ key: "q", label: fmt(t.catalog.queryChip, { query: q }), href: pageHref(basePath, withoutParams(params, "q"), 1) });
  if (brand) chips.push({ key: "brand", label: brand, href: pageHref(basePath, withoutParams(params, "brand"), 1) });
  if (network) chips.push({ key: "network", label: network, href: pageHref(basePath, withoutParams(params, "network"), 1) });
  if (country) chips.push({ key: "country", label: countryName(country, locale), href: pageHref(basePath, withoutParams(params, "country"), 1) });

  const cardLabels = serviceCardLabels(t, c);
  const first = start + 1;
  const last = start + list.data.length;
  const countText = plural(locale, list.total, t.catalog.results, formatNumber(list.total, locale));

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
      <aside aria-label={t.catalog.filters} className="hidden lg:block">
        <Card>
          <CardHeader title={t.catalog.filters} titleAs="h2" />
          <CardBody>
            <CatalogFilters {...filterProps} />
          </CardBody>
        </Card>
      </aside>

      <div className="grid min-w-0 gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-body text-ink-muted">
            <span className="font-semibold text-ink">{countText}</span>
            {list.total > PER_PAGE ? (
              <span className="text-ink-subtle">
                {" · "}
                {fmt(t.catalog.showing, {
                  from: formatNumber(first, locale),
                  to: formatNumber(last, locale),
                  total: formatNumber(list.total, locale),
                })}
              </span>
            ) : null}
          </p>
          <DialogTrigger for="catalog-filters" variant="secondary" size="sm" className="lg:hidden" startIcon={<SlidersHorizontal aria-hidden="true" />}>
            {t.catalog.filters}
            {chips.length > 0 ? (
              <Badge tone="inverse" className="num px-1.5 py-0.5">
                {formatNumber(chips.length, locale)}
              </Badge>
            ) : null}
          </DialogTrigger>
        </div>

        {chips.length > 0 ? (
          <nav aria-label={t.catalog.active}>
            <ul className="flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <li key={chip.key}>
                  <Link
                    href={chip.href}
                    aria-label={fmt(t.catalog.removeFilter, { label: chip.label })}
                    className="touch-target inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-3 py-1.5 text-small font-semibold text-ink transition-colors hover:bg-line-strong"
                  >
                    {chip.label}
                    <X aria-hidden="true" className="size-3.5" />
                  </Link>
                </li>
              ))}
              <li>
                <Link href={basePath} className="touch-target inline-flex px-2 py-1.5 text-small font-semibold text-ink underline underline-offset-4">
                  {t.catalog.clear}
                </Link>
              </li>
            </ul>
          </nav>
        ) : null}

        {list.data.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.data.map((service, i) => (
              <ServiceCard key={service.id} service={service} locale={locale} decimals={currency.decimals} labels={cardLabels} priority={i === 0 && page === 1} />
            ))}
          </div>
        ) : (
          <Card>
            {filtered ? (
              <EmptyState
                icon={<PackageSearch aria-hidden="true" />}
                title={t.catalog.emptyTitle}
                description={t.catalog.emptyText}
                action={<ButtonLink href={basePath} variant="secondary">{t.catalog.emptyAction}</ButtonLink>}
              />
            ) : locale === "ar" ? (
              <EmptyState
                icon={<PackageSearch aria-hidden="true" />}
                title={t.catalog.arEmptyTitle}
                description={t.catalog.arEmptyText}
                action={<ButtonLink href={localePath("en", "/services")} variant="secondary">{t.catalog.arEmptyAction}</ButtonLink>}
              />
            ) : (
              <EmptyState icon={<PackageSearch aria-hidden="true" />} title={t.catalog.noneTitle} description={t.catalog.noneText} />
            )}
          </Card>
        )}

        <Pagination total={list.total} pageSize={PER_PAGE} page={page} basePath={basePath} searchParams={params} />
      </div>

      <Drawer id="catalog-filters" title={t.catalog.filters} description={t.catalog.filtersDescription}>
        <CatalogFilters {...filterProps} />
      </Drawer>
    </div>
  );
}

/** Same layout as the loaded catalog: filter card, toolbar line and a grid of card skeletons. */
function CatalogSkeleton() {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start" aria-busy="true">
      <div aria-hidden="true" className="hidden rounded-card border border-line bg-surface p-6 shadow-card lg:grid lg:gap-5">
        <Skeleton className="h-6 w-24" />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="grid gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-11" />
          </div>
        ))}
        <Skeleton className="h-11 w-32" />
      </div>
      <div className="grid min-w-0 gap-4">
        <div className="flex h-10 items-center justify-between lg:h-6">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-28 lg:hidden" />
        </div>
        <ServiceGridSkeleton count={6} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" />
      </div>
    </div>
  );
}
