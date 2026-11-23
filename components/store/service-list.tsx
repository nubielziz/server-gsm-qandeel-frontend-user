// The browsable service list shared by the home page ("All services", mockup "All Products") and the catalog page
// (`/services`): on the catalog a filter sidebar (Categories with how many services each has, "In stock only", a price
// range, service type, brand, carrier and country, each option with how many services it would leave; a drawer on
// phones), a search box, a sort control, chips, the cards and page links. The home list has no filter panel: its
// "Filters" button is a link to the catalog with the same filters (owner decision, plan P3.4).
// One filter form in the HTML (plan P3.4): the sidebar's (`lg` up). The phone drawer mounts its own copy when it first
// opens (`LazyListFilters`), so its trigger is a plain click handler (`native={false}`: before hydration the drawer is
// empty). Without JavaScript the drawer cannot open: a <noscript> style shows the sidebar on phones too, above the list. The rows and their total come from the API, which filters,
// sorts and pages (lib/catalog.ts `catalogList`); the numbers beside the options are counted over the cached catalog.
// Its state is the page URL (`?category=4-carrier-unlock&stock=1&type=imei&brand=Apple&brand=Samsung&max=20&sort=popular&page=2`):
// it works without JavaScript and can be shared. It reads `searchParams` and the currency cookie, so render it inside
// <Suspense>. Availability is only ever "in stock" or not: no stock level exists anywhere.
// A list with a text search is a search-engine page (feature 29, lib/catalog.ts `searchList`): rows and
// option counts from `GET /store/v1/search`, "Best match" as the default sort (no "Featured"), "Did you mean …?", a
// "Check IMEI" link for an IMEI, an empty state with popular searches, a quiet note while the database answers instead
// of the engine (counts hidden then), and a note when a price sort covers only the best 1000 matches.
import Link from "next/link";
import { Info, PackageSearch, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DialogClose, DialogTrigger, Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { SEARCH_MAX_PAGE } from "@/lib/api/store-query";
import type { ServiceType } from "@/lib/api/types";
import { catalogList } from "@/lib/catalog";
import {
  FACET_KEYS,
  SERVICE_TYPES,
  cleanText,
  defaultSort,
  parseSort,
  searchesEngine,
  sortsFor,
  type FacetKey,
  type ListInput,
  type ListSort,
} from "@/lib/catalog-facets";
import { countryName } from "@/lib/countries";
import { getCurrency } from "@/lib/currency";
import { formatMoney, formatNumber } from "@/lib/format";
import { fmt, plural } from "@/lib/i18n/define";
import { common } from "@/lib/i18n/messages/common";
import { search as searchMessages } from "@/lib/i18n/messages/search";
import { store } from "@/lib/i18n/messages/store";
import { resultsHref } from "@/lib/search/options";
import { popularSearches } from "@/lib/search/popular";
import { sitePath } from "@/lib/site-path";
import { ActiveFilters, type FilterChip } from "./active-filters";
import { serviceCardLabels } from "./card-labels";
import { LazyListFilters, ListFilters, type FilterGroup, type ListFiltersProps } from "./list-filters";
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
  /**
   * Id of the phone filter drawer (unique on the page): the list has the filter panel (sidebar from `lg` up, drawer
   * below). Left out (the home page): no panel, and "Filters" links to the catalog page with the same filters.
   */
  drawerId?: string;
};

/** The list's query parameters, as its links keep them (empty ones are left out). */
export type ListState = Record<"q" | "min" | "max" | "sort" | "stock", string | undefined> & Record<FacetKey | "category", string[]>;

/** The list beside its filter sidebar (`lg` up); without a panel the list alone. */
const LAYOUT = { panel: "grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start", none: "grid gap-6" } as const;

/**
 * Without JavaScript the drawer cannot open and holds no form: show the sidebar (`data-list-filters-aside`) at every
 * width and hide the drawer's trigger (`data-list-filters-trigger`). Not in a cascade layer, so it wins over the
 * `hidden` / `lg:block` utilities (Tailwind's `@layer utilities`).
 */
const NO_SCRIPT_CSS = "[data-list-filters-aside]{display:block}[data-list-filters-trigger]{display:none}";
/** The cards' grids. `reveal-grid`: cards below the fold fade and rise in as they scroll into view (globals.css). */
const GRIDS = {
  mini: "reveal-grid grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4",
  full: "reveal-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-3",
} as const;

/** The URL as a filter request. Text goes through `cleanText`: the API answers 500 to a NUL byte, and the page must not break on a crafted link. */
function readInput(params: SearchParams): ListInput {
  const texts = (value: string | string[] | undefined, max?: number, limit?: number) => allParams(value, max, limit).map(cleanText).filter(Boolean);
  return {
    q: cleanText(firstParam(params.q)),
    category: texts(params.category, 60, 12),
    inStock: firstParam(params.stock) === "1",
    type: allParams(params.type, 10).filter((value): value is ServiceType => (SERVICE_TYPES as readonly string[]).includes(value)),
    brand: texts(params.brand),
    network: texts(params.network),
    country: texts(params.country, 2).map((code) => code.toUpperCase()),
    min: intParam(params.min),
    max: intParam(params.max),
  };
}

/** A price held inside the slider's span. */
function clamp(n: number, bounds: { min: number; max: number }): number {
  return Math.min(Math.max(n, bounds.min), bounds.max);
}

/** Reads the URL, the API and the catalog and prepares everything the list shows (and `catalogSize`, 0 for an empty catalog). */
export async function loadServiceList(searchParams: Promise<SearchParams>, config: ServiceListConfig) {
  const params = await searchParams;
  const currency = await getCurrency();
  const t = store;
  const c = common;
  const s = searchMessages;
  const input = readInput(params);
  // A text search is answered by the search engine: "Best match" is its default sort and "Featured" goes.
  const searching = searchesEngine(input.q);
  const sort: ListSort = parseSort(firstParam(params.sort), searching);
  const list = await catalogList(currency.code, input, sort, Number(firstParam(params.page, 12)) || 1, config.perPage);
  const { filter, bounds } = list;
  // Nothing matched a search: offer the popular searches (a cached shared read; [] when it cannot be read).
  const popular = list.search && list.total === 0 ? await popularSearches() : [];

  const state: ListState = {
    q: filter.q || undefined,
    category: list.categoryEntries.map((entry) => entry.value),
    stock: filter.inStock ? "1" : undefined,
    type: filter.type,
    brand: filter.brand,
    network: filter.network,
    country: filter.country,
    min: filter.min === null ? undefined : String(filter.min),
    max: filter.max === null ? undefined : String(filter.max),
    sort: sort === defaultSort(searching) ? undefined : sort,
  };
  const base = sitePath(config.path || undefined);
  const href = (change: Partial<ListState>) => pageHref(base, { ...state, ...change }, 1) + config.hash;
  // Isolated left-to-right (LRI … PDI) inside the chip's sentence, so "15 US$" keeps its order.
  const money = (n: number) => `⁦${formatMoney(String(n), currency.code, 0)}⁩`;
  const label = (key: FacetKey, value: string) =>
    key === "type" ? (c.serviceType[value as ServiceType] ?? value) : key === "country" ? countryName(value) : value;

  // The numbers beside the options; hidden while the database answers a search instead of the engine (no facets).
  const counted = (n: number) => (list.counts ? `(${formatNumber(n)})` : "");
  const group = (key: FacetKey, title: string): FilterGroup => ({
    name: key,
    label: title,
    options: list.options[key].map((option) => ({
      value: option.value,
      label: label(key, option.value),
      count: counted(option.count),
      selected: option.selected,
    })),
  });
  // Real categories with the API's `serviceCount` (no other filter narrows it); one with no services shows only while selected.
  const categories: FilterGroup = {
    name: "category",
    label: t.home.products.categories,
    options: list.categories
      .map((category) => ({ category, selected: filter.category.includes(category.id) }))
      .filter(({ category, selected }) => category.serviceCount > 0 || selected)
      .map(({ category, selected }) => ({
        value: category.slug,
        label: category.name,
        count: counted(category.serviceCount),
        selected,
      })),
  };
  // One checkbox: how many services are in stock next to the other filters (a number of services, never of codes).
  const availability: FilterGroup = {
    name: "stock",
    label: t.catalog.availability,
    options:
      list.inStock > 0 || filter.inStock
        ? [{ value: "1", label: t.catalog.inStockOnly, count: counted(list.inStock), selected: filter.inStock }]
        : [],
  };

  // One chip per active value: its link leaves out only that value.
  const chips: FilterChip[] = [];
  const chip = (key: string, text: string, change: Partial<ListState>) =>
    // The direction marks of the price are for the eye only: the link's name leaves them out.
    chips.push({ key, label: text, removeLabel: fmt(t.catalog.removeFilter, { label: text.replace(/[⁦-⁩]/g, "") }), href: href(change) });
  if (filter.q) chip("q", fmt(t.catalog.queryChip, { query: filter.q }), { q: undefined });
  // A category the API does not list is not applied, but its chip stays so the visitor can remove the outdated link.
  for (const entry of list.categoryEntries) {
    chip(`category:${entry.value}`, entry.label, { category: state.category.filter((value) => value !== entry.value) });
  }
  if (filter.inStock) chip("stock", t.catalog.inStockOnly, { stock: undefined });
  for (const key of FACET_KEYS) {
    for (const value of filter[key]) chip(`${key}:${value}`, label(key, value), { [key]: filter[key].filter((v) => v !== value) });
  }
  if (bounds && (filter.min !== null || filter.max !== null)) {
    chip("price", fmt(t.home.products.priceChip, { from: money(filter.min ?? bounds.min), to: money(filter.max ?? bounds.max) }), {
      min: undefined,
      max: undefined,
    });
  }

  const sortNames: Record<ListSort, string> = {
    relevance: s.bestMatch,
    featured: t.catalog.sortFeatured,
    popular: t.catalog.sortPopular,
    newest: t.catalog.sortNewest,
    price_asc: t.catalog.sortPriceAsc,
    price_desc: t.catalog.sortPriceDesc,
    title: t.catalog.sortTitle,
  };

  return {
    t,
    c,
    currency,
    sort,
    sorts: sortsFor(searching).map((value) => ({ value, label: sortNames[value] })),
    list,
    state,
    base,
    chips,
    /** The lists above the price range (an empty one is not drawn). */
    top: [categories, availability],
    /** The lists under the price range. */
    groups: [group("type", t.catalog.type), group("brand", t.catalog.brand), group("network", t.catalog.network), group("country", t.catalog.country)],
    price:
      bounds && bounds.min < bounds.max
        ? {
            min: bounds.min,
            max: bounds.max,
            // A search's span covers its matches only, so a range from the URL may reach past it: hold it inside.
            value: [clamp(filter.min ?? bounds.min, bounds), clamp(filter.max ?? bounds.max, bounds)] as [number, number],
            currency: currency.code,
          }
        : null,
    s,
    popular,
    /** The sidebar's filters, carried by the search form as hidden fields (a category the API does not list is not carried). */
    keep: [
      ...list.categoryEntries.filter((entry) => entry.known).map((entry): [string, string] => ["category", entry.value]),
      ...(filter.inStock ? [["stock", "1"] as [string, string]] : []),
      ...FACET_KEYS.flatMap((key) => filter[key].map((value): [string, string] => [key, value])),
      ...(state.min ? [["min", state.min] as [string, string]] : []),
      ...(state.max ? [["max", state.max] as [string, string]] : []),
    ],
  };
}

export type ServiceListData = Awaited<ReturnType<typeof loadServiceList>>;

/**
 * Sidebar (drawer on phones; with a `drawerId` only), toolbar (with "Filters": the drawer's button, or a link to the
 * catalog), chips, count, cards or the empty state, page links.
 */
export function ServiceList({ data, config }: { data: ServiceListData; config: ServiceListConfig }) {
  const { t, c, s, currency, sort, sorts, list, state, base, chips, top, groups, price, keep, popular } = data;
  const { search } = list;
  // The search route serves 50 pages at most: the page links stop there (the count still says the whole total).
  const pagingTotal = search ? Math.min(list.total, SEARCH_MAX_PAGE * config.perPage) : list.total;
  const count = (n: number) => plural(n, t.catalog.results, formatNumber(n));
  const filtered = chips.length > 0;
  const clear = { label: t.catalog.clear, href: base + config.hash };
  const cardLabels = serviceCardLabels(t, c);
  const start = (list.page - 1) * config.perPage;
  const { drawerId } = config;

  const filters: ListFiltersProps = {
    action: base,
    keep: [
      ["q", state.q ?? ""],
      ["sort", state.sort ?? ""],
    ].filter((pair): pair is [string, string] => Boolean(pair[1])),
    top,
    price,
    groups,
    labels: {
      priceRange: t.home.products.priceRange,
      minPrice: t.home.products.minPrice,
      maxPrice: t.home.products.maxPrice,
      showMore: t.home.products.showMore,
      showLess: t.home.products.showLess,
      apply: t.catalog.apply,
      clear: t.catalog.clear,
    },
    clearHref: filtered ? base : null,
  };

  // "Filters" and how many are active: opens the drawer (catalog, phones) or links to the catalog (home).
  const filtersLabel = (
    <>
      {t.catalog.filters}
      {filtered ? (
        <Badge tone="inverse" className="num px-1.5 py-0.5">
          {formatNumber(chips.length)}
        </Badge>
      ) : null}
    </>
  );
  const filtersControl = drawerId ? (
    <DialogTrigger
      for={drawerId}
      native={false}
      variant="secondary"
      className="lg:hidden"
      startIcon={<SlidersHorizontal aria-hidden="true" />}
      data-list-filters-trigger=""
    >
      {filtersLabel}
    </DialogTrigger>
  ) : (
    <ButtonLink href={pageHref(sitePath("/services"), state, 1)} variant="secondary" startIcon={<SlidersHorizontal aria-hidden="true" />}>
      {filtersLabel}
    </ButtonLink>
  );

  return (
    <>
      <div className={drawerId ? LAYOUT.panel : LAYOUT.none}>
        {drawerId ? (
          <aside aria-label={t.catalog.filters} className="hidden lg:block" data-list-filters-aside="">
            <Card className="p-4">
              <ListFilters {...filters} />
            </Card>
          </aside>
        ) : null}

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
              sorts,
            }}
            extra={filtersControl}
          />

          <ActiveFilters label={t.catalog.active} chips={chips} clear={clear} />

          <p aria-live="polite" className="text-small text-ink-muted">
            <span className="font-semibold text-ink">{count(list.total)}</span>
            {list.total > config.perPage ? (
              <span className="text-ink-subtle">
                {" · "}
                {fmt(t.catalog.showing, {
                  from: formatNumber(start + 1),
                  to: formatNumber(start + list.rows.length),
                  total: formatNumber(list.total),
                })}
              </span>
            ) : null}
          </p>

          {search ? <SearchNotes data={data} config={config} /> : null}

          {list.rows.length > 0 ? (
            <div className={GRIDS[config.cards]}>
              {list.rows.map((service, i) =>
                config.cards === "full" ? (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    decimals={currency.decimals}
                    labels={cardLabels}
                    priority={i === 0 && list.page === 1}
                    index={i}
                  />
                ) : (
                  <ServiceCardMini key={service.id} service={service} decimals={currency.decimals} labels={cardLabels} index={i} />
                ),
              )}
            </div>
          ) : search ? (
            <Card>
              <EmptyState
                icon={<PackageSearch aria-hidden="true" />}
                title={fmt(s.noResults, { q: state.q ?? "" })}
                description={s.noResultsText}
                action={
                  <div className="grid justify-items-center gap-4">
                    {popular.length > 0 ? (
                      <nav aria-label={s.popular} className="grid justify-items-center gap-2">
                        <p className="text-small font-semibold text-ink">{s.popular}</p>
                        <ul className="flex flex-wrap justify-center gap-2">
                          {popular.map((term) => (
                            <li key={term}>
                              <Link
                                href={resultsHref(sitePath("/services"), term)}
                                prefetch={false}
                                className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 text-small font-medium text-ink transition-colors hover:border-ink"
                              >
                                {term}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </nav>
                    ) : null}
                    <ButtonLink href={clear.href} variant="secondary">
                      {t.catalog.emptyAction}
                    </ButtonLink>
                  </div>
                }
              />
            </Card>
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

          <Pagination total={pagingTotal} pageSize={config.perPage} page={list.page} basePath={base} searchParams={state} hash={config.hash} />
        </div>
      </div>

      {drawerId ? (
        <>
          <Drawer
            id={drawerId}
            title={t.catalog.filters}
            description={t.catalog.filtersDescription}
            footer={<DialogClose variant="primary">{t.catalog.apply}</DialogClose>}
          >
            <LazyListFilters dialogId={drawerId} {...filters} />
          </Drawer>
          <noscript>
            <style>{NO_SCRIPT_CSS}</style>
          </noscript>
        </>
      ) : null}
    </>
  );
}

/**
 * What a search-engine page says above its cards: "Did you mean …?" (a link to the corrected search, the filters kept),
 * a quiet note while the database answers instead of the engine, and the note
 * that a price sort covers only the best 1000 matches.
 */
function SearchNotes({ data, config }: { data: ServiceListData; config: ServiceListConfig }) {
  const { s, list, state, base, sort } = data;
  const { search } = list;
  if (!search) return null;
  const [before, after = ""] = s.didYouMean.split("{q}");
  const priceSorted = sort === "price_asc" || sort === "price_desc";
  const notes = [
    search.didYouMean ? (
      <p key="dym" className="text-body text-ink">
        {before}
        <Link href={pageHref(base, { ...state, q: search.didYouMean }, 1) + config.hash} className="font-bold underline underline-offset-4">
          {search.didYouMean}
        </Link>
        {after}
      </p>
    ) : null,
    search.engine === "fallback" ? (
      <p key="fallback" className="flex items-center gap-1.5 text-small text-ink-subtle">
        <Info aria-hidden="true" className="size-4 shrink-0" />
        {s.fallback}
      </p>
    ) : null,
    search.truncated && priceSorted ? (
      <p key="truncated" className="text-small text-ink-subtle">
        {s.priceTruncated}
      </p>
    ) : null,
  ].filter(Boolean);
  return notes.length > 0 ? <div className="grid gap-1.5">{notes}</div> : null;
}

/** The same layout while the list streams in: filter card (with a panel), toolbar, count, a page of card skeletons. */
export function ServiceListSkeleton({ config, rows }: { config: ServiceListConfig; rows?: number }) {
  const Skel = config.cards === "full" ? ServiceCardSkeleton : ServiceCardMiniSkeleton;
  return (
    <div className={config.drawerId ? LAYOUT.panel : LAYOUT.none} aria-busy="true">
      {config.drawerId ? (
        <div aria-hidden="true" className="hidden gap-5 rounded-card border border-line bg-surface p-4 shadow-card lg:grid">
          {[4, 1, 0, 4, 5].map((n, i) => (
            <div key={i} className="grid gap-2">
              <Skeleton className="h-4 w-24" />
              {n === 0 ? <Skeleton className="h-12" /> : Array.from({ length: n }, (_, j) => <Skeleton key={j} className="h-6" />)}
            </div>
          ))}
        </div>
      ) : null}
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
