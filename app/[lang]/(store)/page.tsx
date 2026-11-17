// Shop home (mockup "E-Commerce", adapted to the API): dark hero with the quick IMEI check and the track promo, the brand
// tiles, featured services, "how it works" beside the best sellers (a dense row of the API's `popular` sort), the
// featured collections, the new arrivals (a dense row of its `listedAt` sort), the list of all services (filters, search,
// sort, pages: its state is in the home URL) and banners to the rest of the site. A section whose list is empty is left out.
// The hero, quick check, promo, steps and banners are static. Everything that reads the catalog (language-specific
// cached reads), the visitor's currency cookie or the URL's query streams in behind <Suspense> with skeletons of the
// same size; the merchant banner is a small Client Component (no server read).
// Motion: the hero row never animates (LCP). The blocks below it fade and rise in as they scroll into view (CSS
// scroll-driven `.reveal` / `.reveal-grid`, globals.css); a client navigation to the page plays the shop's page enter.
import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { ArrowRight, Flame, PackageSearch } from "lucide-react";
import { Container, Section } from "@/components/layout/container";
import { PageTransition } from "@/components/layout/page-transition";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { serviceCardLabels } from "@/components/store/card-labels";
import { MerchantBanner } from "@/components/store/merchant-banner";
import {
  CatalogTiles,
  CatalogTilesSkeleton,
  DestinationBanners,
  GuestPoint,
  HeroPrice,
  HeroPriceSpace,
  HomeHero,
  HomePanel,
  HowItWorks,
  MiniGrid,
  MiniGridSkeleton,
  QuickImeiCard,
  TrackPromoCard,
  type CatalogTile,
} from "@/components/store/home-parts";
import { CollectionBanners, CollectionBannersSkeleton } from "@/components/store/home-collections";
import { HomeProducts, HomeProductsSkeleton } from "@/components/store/home-products";
import { ServiceCard, ServiceCardMini, ServiceGridSkeleton } from "@/components/store/service-card";
import { getStoreConfig, listStoreServices } from "@/lib/api/public";
import { catalogCollections, catalogCounts, lowestPrice, type CatalogCount } from "@/lib/catalog";
import { sortQuery, type ListSort } from "@/lib/catalog-facets";
import { getCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format";
import { localePath, type Locale } from "@/lib/i18n/config";
import { plural } from "@/lib/i18n/define";
import { common } from "@/lib/i18n/messages/common";
import { store, type StoreMessages } from "@/lib/i18n/messages/store";
import { getLocale, getMessages } from "@/lib/i18n/server";

/** The featured cards. `reveal-grid`: below the fold they fade and rise in as they scroll into view (globals.css). */
const GRID = "reveal-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4";
const SKELETON_CARDS = 4;
/** Tiles before the "All services" tile: eight tiles fill the row on a desktop. */
const FILTER_TILES = 7;
/** One row of dense cards: the best sellers beside "How it works" and the new arrivals. */
const MINI_CARDS = 4;

/** The filtered states of the home list (`/en?brand=Apple`) are the same page: one canonical URL. */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { alternates: { canonical: localePath(locale) } };
}

export default async function HomePage(props: PageProps<"/[lang]">) {
  const [locale, t] = await Promise.all([getLocale(), getMessages(store)]);

  return (
    <PageTransition>
      <Container width="wide" className="grid gap-8 py-5 lg:gap-10 lg:py-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)]">
          <HomeHero
            locale={locale}
            t={t.home}
            thirdPoint={
              <Suspense fallback={<li aria-hidden="true" className="h-[1lh] w-36 rounded-badge bg-inverse-raised" />}>
                <GuestPointFromConfig t={t.home} />
              </Suspense>
            }
            price={
              <Suspense fallback={<HeroPriceSpace />}>
                <LowestPrice locale={locale} label={t.home.hero.from} />
              </Suspense>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:grid-rows-[auto_1fr]">
            <QuickImeiCard locale={locale} t={t.home} />
            <TrackPromoCard locale={locale} t={t.home} />
          </div>
        </div>

        <MerchantBanner text={t.home.merchant.text} cta={t.home.merchant.cta} href={localePath(locale, "/merchant/services")} />

        <Suspense fallback={<CatalogTilesSkeleton />}>
          <Tiles locale={locale} />
        </Suspense>

        <Suspense fallback={<FeaturedSkeleton title={t.home.featured.title} />}>
          <Featured locale={locale} />
        </Suspense>

        <Suspense fallback={<HowAndMore t={t.home} more={<MiniGridSkeleton count={MINI_CARDS} />} />}>
          <HowAndBestSellers locale={locale} />
        </Suspense>

        <Suspense fallback={<CollectionsSkeleton title={t.home.collections.title} />}>
          <Collections locale={locale} />
        </Suspense>

        <Suspense fallback={<NewArrivalsSkeleton title={t.home.newArrivals.title} />}>
          <NewArrivals locale={locale} />
        </Suspense>

        <Suspense fallback={<HomeProductsSkeleton t={t.home.products} />}>
          <HomeProducts searchParams={props.searchParams} />
        </Suspense>

        <Section reveal headingId="home-explore" title={t.home.explore.title}>
          <DestinationBanners locale={locale} t={t.home.explore} />
        </Section>
      </Container>
    </PageTransition>
  );
}

/** Whether an account is needed comes from the shop config (cached): streamed so the page shell stays static. */
async function GuestPointFromConfig({ t }: { t: StoreMessages["home"] }) {
  const config = await getStoreConfig();
  return <GuestPoint guestCheckout={config.policies.guestCheckout} t={t} />;
}

/** "Starting from": the lowest price of the catalog in the visitor's currency. Nothing for an empty catalog. */
async function LowestPrice({ locale, label }: { locale: Locale; label: string }) {
  const currency = await getCurrency();
  const price = await lowestPrice(currency.code);
  if (!price) return null;
  return <HeroPrice amount={price.gross} currency={price.currency} locale={locale} decimals={currency.decimals} label={label} />;
}

/** "View all": the whole catalog, or in the sort of the section that links ("Best sellers" → `?sort=popular`). */
async function ViewAll({ locale, sort }: { locale: Locale; sort?: Exclude<ListSort, "featured"> }) {
  const c = await getMessages(common);
  const services = localePath(locale, "/services");
  return (
    // prefetch: the catalog's first page in this sort comes with the prefetch, so it shows at once on the click (plan P3.1).
    <ButtonLink
      href={sort ? `${services}?sort=${sort}` : services}
      prefetch
      variant="ghost"
      size="sm"
      className="-me-3.5 -mb-1.5"
      endIcon={<ArrowRight aria-hidden="true" />}
    >
      {c.actions.viewAll}
    </ButtonLink>
  );
}

/**
 * The tiles strip: the brands with the most services and, when they do not fill the row, the busiest carriers after
 * them. Nothing while the catalog has neither.
 */
async function Tiles({ locale }: { locale: Locale }) {
  const [t, c, catalog] = await Promise.all([getMessages(store), getMessages(common), catalogCounts()]);
  const count = (n: number) => plural(locale, n, t.catalog.results, formatNumber(n, locale));
  const tile = (kind: CatalogTile["kind"]) => (row: CatalogCount): CatalogTile => ({ kind, name: row.name, count: count(row.count) });
  const tiles = [...catalog.brands.map(tile("brand")), ...catalog.networks.map(tile("network"))].slice(0, FILTER_TILES);
  if (tiles.length === 0) return null;
  return <CatalogTiles tiles={tiles} all={{ name: c.nav.allServices, count: count(catalog.total) }} locale={locale} label={t.home.browse.title} />;
}

/** Featured services (priced in the visitor's currency), or an empty state for an empty catalog. */
async function Featured({ locale }: { locale: Locale }) {
  const [t, c, currency, catalog] = await Promise.all([getMessages(store), getMessages(common), getCurrency(), catalogCounts()]);
  const featured = await listStoreServices({ currency: currency.code, featured: true, start: 0, end: 8 });
  if (featured.data.length === 0) {
    if (catalog.total > 0) return null;
    return (
      <Card>
        <EmptyState icon={<PackageSearch aria-hidden="true" />} title={t.home.empty.title} description={t.home.empty.text} />
      </Card>
    );
  }
  const labels = serviceCardLabels(t, c);
  return (
    <Section reveal headingId="home-featured" title={t.home.featured.title} actions={<ViewAll locale={locale} />}>
      <div className={GRID}>
        {featured.data.map((service) => (
          <ServiceCard key={service.id} service={service} locale={locale} decimals={currency.decimals} labels={labels} />
        ))}
      </div>
    </Section>
  );
}

/** The featured section's heading and a row of card skeletons while the catalog streams in. */
function FeaturedSkeleton({ title }: { title: string }) {
  return (
    <Section reveal headingId="home-featured" title={title}>
      <ServiceGridSkeleton count={SKELETON_CARDS} className={GRID} />
    </Section>
  );
}

/** The featured collections (brands, countries, carriers with the most services) priced in the visitor's currency; none below two. */
async function Collections({ locale }: { locale: Locale }) {
  const [t, currency] = await Promise.all([getMessages(store), getCurrency()]);
  const collections = await catalogCollections(currency.code);
  if (collections.length < 2) return null;
  return (
    <Section reveal headingId="home-collections" title={t.home.collections.title}>
      <CollectionBanners
        collections={collections}
        locale={locale}
        decimals={currency.decimals}
        t={t.home.collections}
        countText={(n) => plural(locale, n, t.catalog.results, formatNumber(n, locale))}
      />
    </Section>
  );
}

function CollectionsSkeleton({ title }: { title: string }) {
  return (
    <Section reveal headingId="home-collections" title={title}>
      <CollectionBannersSkeleton />
    </Section>
  );
}

/** "How it works" and, beside it from `xl` up, the "Best sellers" panel. The steps fill the row when it is alone. */
function HowAndMore({ t, more, action }: { t: StoreMessages["home"]; more: ReactNode; action?: ReactNode }) {
  if (!more) return <HowItWorks t={t.how} layout="row" />;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,9fr)]">
      <HowItWorks t={t.how} layout="stack" />
      <HomePanel id="home-best-sellers" icon={<Flame aria-hidden="true" />} title={t.bestSellers.title} action={action}>
        {more}
      </HomePanel>
    </div>
  );
}

/**
 * The four best sellers (`_sort=popular&_order=desc`, BH §2.2) as dense cards, priced in the visitor's currency. Only
 * the steps when the catalog lists nothing. "View all" opens the catalog in the same sort.
 */
async function HowAndBestSellers({ locale }: { locale: Locale }) {
  const [t, c, currency] = await Promise.all([getMessages(store), getMessages(common), getCurrency()]);
  const list = await listStoreServices({ currency: currency.code, ...sortQuery("popular"), start: 0, end: MINI_CARDS });
  if (list.data.length === 0) return <HowAndMore t={t.home} more={null} />;
  const labels = serviceCardLabels(t, c);
  return (
    <HowAndMore
      t={t.home}
      action={<ViewAll locale={locale} sort="popular" />}
      more={
        <MiniGrid>
          {list.data.map((service) => (
            <ServiceCardMini key={service.id} service={service} locale={locale} decimals={currency.decimals} labels={labels} />
          ))}
        </MiniGrid>
      }
    />
  );
}

/**
 * The four newest listings (`_sort=listedAt&_order=desc`, BH §2.2) as dense cards, after the featured collections. A
 * section, not a badge: "new" never depends on the clock (plan D18). Nothing when the catalog lists nothing.
 */
async function NewArrivals({ locale }: { locale: Locale }) {
  const [t, c, currency] = await Promise.all([getMessages(store), getMessages(common), getCurrency()]);
  const list = await listStoreServices({ currency: currency.code, ...sortQuery("newest"), start: 0, end: MINI_CARDS });
  if (list.data.length === 0) return null;
  const labels = serviceCardLabels(t, c);
  return (
    <Section reveal headingId="home-new-arrivals" title={t.home.newArrivals.title} actions={<ViewAll locale={locale} sort="newest" />}>
      <MiniGrid>
        {list.data.map((service) => (
          <ServiceCardMini key={service.id} service={service} locale={locale} decimals={currency.decimals} labels={labels} />
        ))}
      </MiniGrid>
    </Section>
  );
}

/** The new arrivals' heading and a row of dense card skeletons while the catalog streams in. */
function NewArrivalsSkeleton({ title }: { title: string }) {
  return (
    <Section reveal headingId="home-new-arrivals" title={title}>
      <MiniGridSkeleton count={MINI_CARDS} />
    </Section>
  );
}
