// The browsable service list shared by the home page ("All services", mockup "All Products") and the catalog page
// (`/services`): a filter sidebar (Categories = the service types, a price range, brand, carrier and country, each
// option with how many services it would leave; a drawer on phones), a search box, a sort control, chips, the cards and
// page links. The API cannot filter by type or price and has no counts, so the list is worked out over the cached
// catalog (lib/catalog.ts `catalogList`, the API's own rules for the rest). Its state is the page URL
// (`?type=imei&brand=Apple&brand=Samsung&max=20&page=2`): it works without JavaScript and can be shared. It reads
// `searchParams` and the currency cookie, so render it inside <Suspense>. Availability (stock) needs the backend:
// docs/BACKEND-NEEDS.md §1.
import { PackageSearch, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DialogClose, DialogTrigger, Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import type { ServiceType } from "@/lib/api/types";
import { catalogList } from "@/lib/catalog";
import type { FacetKey, ListFilter, ListSort } from "@/lib/catalog-facets";
import { countryName } from "@/lib/countries";
import { getCurrency } from "@/lib/currency";
import { formatMoney, formatNumber } from "@/lib/format";
import { localePath } from "@/lib/i18n/config";
import { fmt, plural } from "@/lib/i18n/define";
import { common } from "@/lib/i18n/messages/common";
import { store } from "@/lib/i18n/messages/store";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { ActiveFilters, type FilterChip } from "./active-filters";
import { serviceCardLabels } from "./card-labels";
import { ListFilters, type FilterGroup } from "./list-filters";
import { ListToolbar } from "./list-toolbar";
import { allParams, firstParam, intParam, type SearchParams } from "./search-params";
import { ServiceCard, ServiceCardMini, ServiceCardMiniSkeleton, ServiceCardSkeleton } from "./service-card";

export type ServiceListConfig = {
  /** The page's path after the language: "" (home) or "/services". */
  path: "" | "/services";
  perPage: number;
  /** Ends the search, chip and page links (`#all-services`) so the list's top comes into view; "" for none. */
  hash: string;
  /** `mini`: dense cards, 4 a row (home). `full`: ServiceCard, 3 a row (catalog). */
  cards: "mini" | "full";
  /** Id of the phone filter drawer (unique on the page). */
  drawerId: string;
};

/** The list's query parameters, as its links keep them (empty ones are left out). */
export type ListState = Record<"q" | "min" | "max" | "sort", string | undefined> & Record<FacetKey, string[]>;

const LAYOUT = "grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start";
const GRIDS = {
  mini: "grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4",
  full: "grid gap-4 sm:grid-cols-2 xl:grid-cols-3",
} as const;
const SERVICE_TYPES: readonly ServiceType[] = ["imei", "server", "remote", "file"];
const FIELDS = ["type", "brand", "network", "country"] as const;

function readFilter(params: SearchParams): ListFilter {
  return {
    q: firstParam(params.q),
    type: allParams(params.type, 10).filter((value): value is ServiceType => (SERVICE_TYPES as readonly string[]).includes(value)),
    brand: allParams(params.brand),
    network: allParams(params.network),
    country: allParams(params.country, 2).map((code) => code.toUpperCase()),
    min: intParam(params.min),
    max: intParam(params.max),
  };
}

/** Reads the URL and the catalog and prepares everything the list shows (and `catalogSize`, 0 for an empty catalog). */
export async function loadServiceList(searchParams: Promise<SearchParams>, config: ServiceListConfig) {
  const params = await searchParams;
  const [locale, t, c, currency] = await Promise.all([getLocale(), getMessages(store), getMessages(common), getCurrency()]);
  const sort: ListSort = firstParam(params.sort) === "title" ? "title" : "featured";
  const list = await catalogList(locale, currency.code, readFilter(params), sort, Number(firstParam(params.page)) || 1, config.perPage);
  const { filter, bounds } = list;

  const state: ListState = {
    q: filter.q || undefined,
    type: filter.type,
    brand: filter.brand,
    network: filter.network,
    country: filter.country,
    min: filter.min === null ? undefined : String(filter.min),
    max: filter.max === null ? undefined : String(filter.max),
    sort: sort === "title" ? "title" : undefined,
  };
  const base = localePath(locale, config.path || undefined);
  const href = (change: Partial<ListState>) => pageHref(base, { ...state, ...change }, 1) + config.hash;
  // Isolated left-to-right (LRI … PDI) inside the chip's sentence, so "15 US$" keeps its order in Arabic.
  const money = (n: number) => `⁦${formatMoney(String(n), currency.code, locale, 0)}⁩`;
  const label = (key: FacetKey, value: string) =>
    key === "type" ? (c.serviceType[value as ServiceType] ?? value) : key === "country" ? countryName(value, locale) : value;

  const group = (key: FacetKey, title: string): FilterGroup => ({
    name: key,
    label: title,
    options: list.options[key].map((option) => ({
      value: option.value,
      label: label(key, option.value),
      count: `(${formatNumber(option.count, locale)})`,
      selected: option.selected,
    })),
  });
  const categories = group("type", t.home.products.categories);

  // One chip per active value: its link leaves out only that value.
  const chips: FilterChip[] = [];
  const chip = (key: string, text: string, change: Partial<ListState>) =>
    // The direction marks of the price are for the eye only: the link's name leaves them out.
    chips.push({ key, label: text, removeLabel: fmt(t.catalog.removeFilter, { label: text.replace(/[⁦-⁩]/g, "") }), href: href(change) });
  if (filter.q) chip("q", fmt(t.catalog.queryChip, { query: filter.q }), { q: undefined });
  for (const key of FIELDS) {
    for (const value of filter[key]) chip(`${key}:${value}`, label(key, value), { [key]: filter[key].filter((v) => v !== value) });
  }
  if (bounds && (filter.min !== null || filter.max !== null)) {
    chip("price", fmt(t.home.products.priceChip, { from: money(filter.min ?? bounds.min), to: money(filter.max ?? bounds.max) }), {
      min: undefined,
      max: undefined,
    });
  }

  return {
    locale,
    t,
    c,
    currency,
    sort,
    list,
    state,
    base,
    chips,
    categories: categories.options.length > 0 ? categories : null,
    groups: [group("brand", t.catalog.brand), group("network", t.catalog.network), group("country", t.catalog.country)],
    price:
      bounds && bounds.min < bounds.max
        ? { min: bounds.min, max: bounds.max, value: [filter.min ?? bounds.min, filter.max ?? bounds.max] as [number, number], currency: currency.code }
        : null,
    /** The sidebar's filters, carried by the search form as hidden fields. */
    keep: [
      ...FIELDS.flatMap((key) => filter[key].map((value): [string, string] => [key, value])),
      ...(state.min ? [["min", state.min] as [string, string]] : []),
      ...(state.max ? [["max", state.max] as [string, string]] : []),
    ],
  };
}

export type ServiceListData = Awaited<ReturnType<typeof loadServiceList>>;

/** Sidebar (drawer on phones), toolbar, chips, count, cards or the empty state, page links. */
export function ServiceList({ data, config }: { data: ServiceListData; config: ServiceListConfig }) {
  const { locale, t, c, currency, sort, list, state, base, chips, categories, groups, price, keep } = data;
  const count = (n: number) => plural(locale, n, t.catalog.results, formatNumber(n, locale));
  const filtered = chips.length > 0;
  const clear = { label: t.catalog.clear, href: base + config.hash };
  const cardLabels = serviceCardLabels(t, c);
  const start = (list.page - 1) * config.perPage;

  const filters = (
    <ListFilters
      action={base}
      keep={[
        ["q", state.q ?? ""],
        ["sort", state.sort ?? ""],
      ].filter((pair): pair is [string, string] => Boolean(pair[1]))}
      categories={categories}
      price={price}
      groups={groups}
      locale={locale}
      labels={{
        priceRange: t.home.products.priceRange,
        minPrice: t.home.products.minPrice,
        maxPrice: t.home.products.maxPrice,
        showMore: t.home.products.showMore,
        showLess: t.home.products.showLess,
        apply: t.catalog.apply,
        clear: t.catalog.clear,
      }}
      clearHref={filtered ? base : null}
    />
  );

  return (
    <>
      <div className={LAYOUT}>
        <aside aria-label={t.catalog.filters} className="hidden lg:block">
          <Card className="p-4">{filters}</Card>
        </aside>

        <div className="grid min-w-0 gap-4">
          <ListToolbar
            key={[state.q, sort, ...keep.flat()].join("\u0000")}
            action={base}
            hash={config.hash}
            q={state.q ?? ""}
            sort={sort}
            keep={keep}
            labels={{
              search: t.catalog.search,
              searchPlaceholder: t.catalog.searchPlaceholder,
              searchSubmit: t.home.products.searchSubmit,
              sort: t.catalog.sort,
              sortFeatured: t.catalog.sortFeatured,
              sortTitle: t.catalog.sortTitle,
            }}
            extra={
              <DialogTrigger for={config.drawerId} variant="secondary" className="lg:hidden" startIcon={<SlidersHorizontal aria-hidden="true" />}>
                {t.catalog.filters}
                {filtered ? (
                  <Badge tone="inverse" className="num px-1.5 py-0.5">
                    {formatNumber(chips.length, locale)}
                  </Badge>
                ) : null}
              </DialogTrigger>
            }
          />

          <ActiveFilters label={t.catalog.active} chips={chips} clear={clear} />

          <p aria-live="polite" className="text-small text-ink-muted">
            <span className="font-semibold text-ink">{count(list.total)}</span>
            {list.total > config.perPage ? (
              <span className="text-ink-subtle">
                {" · "}
                {fmt(t.catalog.showing, {
                  from: formatNumber(start + 1, locale),
                  to: formatNumber(start + list.rows.length, locale),
                  total: formatNumber(list.total, locale),
                })}
              </span>
            ) : null}
          </p>

          {list.rows.length > 0 ? (
            <div className={GRIDS[config.cards]}>
              {list.rows.map((service, i) =>
                config.cards === "full" ? (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    locale={locale}
                    decimals={currency.decimals}
                    labels={cardLabels}
                    priority={i === 0 && list.page === 1}
                  />
                ) : (
                  <ServiceCardMini key={service.id} service={service} locale={locale} decimals={currency.decimals} labels={cardLabels} />
                ),
              )}
            </div>
          ) : (
            <Card>
              <EmptyState
                icon={<PackageSearch aria-hidden="true" />}
                title={t.catalog.emptyTitle}
                description={t.catalog.emptyText}
                action={
                  <ButtonLink href={clear.href} variant="secondary">
                    {t.catalog.emptyAction}
                  </ButtonLink>
                }
              />
            </Card>
          )}

          <Pagination total={list.total} pageSize={config.perPage} page={list.page} basePath={base} searchParams={state} hash={config.hash} />
        </div>
      </div>

      <Drawer
        id={config.drawerId}
        title={t.catalog.filters}
        description={t.catalog.filtersDescription}
        footer={<DialogClose variant="primary">{t.catalog.apply}</DialogClose>}
      >
        {filters}
      </Drawer>
    </>
  );
}

/** The same layout while the list streams in: filter card, toolbar, count, a page of card skeletons. */
export function ServiceListSkeleton({ config, rows }: { config: ServiceListConfig; rows?: number }) {
  const Skel = config.cards === "full" ? ServiceCardSkeleton : ServiceCardMiniSkeleton;
  return (
    <div className={LAYOUT} aria-busy="true">
      <div aria-hidden="true" className="hidden gap-5 rounded-card border border-line bg-surface p-4 shadow-card lg:grid">
        {[1, 0, 2, 4].map((n, i) => (
          <div key={i} className="grid gap-2">
            <Skeleton className="h-4 w-24" />
            {n === 0 ? <Skeleton className="h-12" /> : Array.from({ length: n }, (_, j) => <Skeleton key={j} className="h-6" />)}
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="grid min-w-0 gap-4">
        <div className="flex flex-wrap gap-x-4 gap-y-3">
          <Skeleton className="h-11 min-w-0 flex-[1_1_16rem]" />
          <Skeleton className="h-11 w-56 max-sm:w-full" />
        </div>
        <div className="text-small">
          <Skeleton className="h-[1lh] w-24" />
        </div>
        <div className={GRIDS[config.cards]}>
          {Array.from({ length: rows ?? config.perPage }, (_, i) => (
            <Skel key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
