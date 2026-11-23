// Shop home (mockup "E-Commerce", adapted to the API): dark hero with the visitor's balance box and the track promo, the brand
// tiles, featured services, "how it works" beside the best sellers (a dense row of the API's `popular` sort), the
// featured collections, the new arrivals (a dense row of its `listedAt` sort), the list of all services (filters, search,
// sort, pages: its state is in the home URL) and banners to the rest of the site. A section whose list is empty is left out.
// The hero, promo, steps and banners are static. Everything that reads the catalog (language-specific
// cached reads), the visitor's currency cookie or the URL's query streams in behind <Suspense> with skeletons of the
// same size; the merchant banner is a small Client Component (no server read).
// The balance box (components/store/home-balance.tsx) reads the visitor's sessions and wallet: personal, never cached, also
// behind <Suspense>.
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
  TrackPromoCard,
  type CatalogTile,
} from "@/components/store/home-parts";
import { HomeBalance, HomeBalanceSkeleton } from "@/components/store/home-balance";
import { CollectionCards, CollectionCardsSkeleton } from "@/components/store/home-collections";
import { HomeProducts, HomeProductsSkeleton } from "@/components/store/home-products";
import { ServiceCard, ServiceCardMini, ServiceGridSkeleton } from "@/components/store/service-card";
import { getStoreConfig, listStoreServices } from "@/lib/api/public";
import { catalogCollections, catalogCounts, lowestPrice, type CatalogCount } from "@/lib/catalog";
import { sortQuery, type ListSort } from "@/lib/catalog-facets";
import { getCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format";
import { plural } from "@/lib/i18n/define";
import { common } from "@/lib/i18n/messages/common";
import { store, type StoreMessages } from "@/lib/i18n/messages/store";
import { sitePath } from "@/lib/site-path";

/** The featured cards. `reveal-grid`: below the fold they fade and rise in as they scroll into view (globals.css). */
const GRID = "reveal-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4";
const SKELETON_CARDS = 4;
/** Tiles before the "All services" tile: eight tiles fill the row on a desktop. */
const FILTER_TILES = 7;
/** One row of dense cards: the best sellers beside "How it works" and the new arrivals. */
const MINI_CARDS = 4;

/** The filtered states of the home list (`/en?brand=Apple`) are the same page: one canonical URL. */
export async function generateMetadata(): Promise<Metadata> {
  return { alternates: { canonical: sitePath() } };
}

export default function HomePage(props: PageProps<"/en">) {
  const t = store;

  return (
    <PageTransition>
      <Container width="wide" className="grid gap-8 py-5 lg:gap-10 lg:py-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)]">
          <HomeHero
            t={t.home}
            thirdPoint={
              <Suspense fallback={<li aria-hidden="true" className="h-[1lh] w-36 rounded-badge bg-inverse-raised" />}>
                <GuestPointFromConfig t={t.home} />
              </Suspense>
            }
            price={
              <Suspense fallback={<HeroPriceSpace />}>
                <LowestPrice label={t.home.hero.from} />
              </Suspense>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:grid-rows-[auto_1fr]">
            <Suspense fallback={<HomeBalanceSkeleton />}>
              <HomeBalance />
            </Suspense>
            <TrackPromoCard t={t.home} />
          </div>
        </div>

        <MerchantBanner text={t.home.merchant.text} cta={t.home.merchant.cta} href={sitePath("/merchant/services")} />

        <Suspense fallback={<CatalogTilesSkeleton />}>
          <Tiles />
        </Suspense>

        <Suspense fallback={<FeaturedSkeleton title={t.home.featured.title} />}>
          <Featured />
        </Suspense>

        <Suspense fallback={<HowAndMore t={t.home} more={<MiniGridSkeleton count={MINI_CARDS} />} />}>
          <HowAndBestSellers />
        </Suspense>

        <Suspense fallback={<CollectionsSkeleton title={t.home.collections.title} />}>
          <Collections />
        </Suspense>

        <Suspense fallback={<NewArrivalsSkeleton title={t.home.newArrivals.title} />}>
          <NewArrivals />
        </Suspense>

        <Suspense fallback={<HomeProductsSkeleton t={t.home.products} />}>
          <HomeProducts searchParams={props.searchParams} />
        </Suspense>

        <Section reveal headingId="home-explore" title={t.home.explore.title}>
          <DestinationBanners t={t.home.explore} />
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
async function LowestPrice({ label }: { label: string }) {
  const currency = await getCurrency();
  const price = await lowestPrice(currency.code);
  if (!price) return null;
  return <HeroPrice amount={price.gross} currency={price.currency} decimals={currency.decimals} label={label} />;
}

/** "View all": the whole catalog, or in the sort of the section that links ("Best sellers" → `?sort=popular`). */
function ViewAll({ sort }: { sort?: Exclude<ListSort, "featured"> }) {
  const c = common;
  const services = sitePath("/services");
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
async function Tiles() {
  const catalog = await catalogCounts();
  const t = store;
  const c = common;
  const count = (n: number) => plural(n, t.catalog.results, formatNumber(n));
  const tile = (kind: CatalogTile["kind"]) => (row: CatalogCount): CatalogTile => ({ kind, name: row.name, count: count(row.count) });
  const tiles = [...catalog.brands.map(tile("brand")), ...catalog.networks.map(tile("network"))].slice(0, FILTER_TILES);
  if (tiles.length === 0) return null;
  return <CatalogTiles tiles={tiles} all={{ name: c.nav.allServices, count: count(catalog.total) }} label={t.home.browse.title} />;
}

/** Featured services (priced in the visitor's currency), or an empty state for an empty catalog. */
async function Featured() {
  const [currency, catalog] = await Promise.all([getCurrency(), catalogCounts()]);
  const t = store;
  const c = common;
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
    <Section reveal headingId="home-featured" title={t.home.featured.title} actions={<ViewAll />}>
      <div className={GRID}>
        {featured.data.map((service) => (
          <ServiceCard key={service.id} service={service} decimals={currency.decimals} labels={labels} />
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

/**
 * The featured collections (brands, countries, carriers with the most services), each with its best sellers, priced in
 * the visitor's currency; none below two.
 */
async function Collections() {
  const currency = await getCurrency();
  const t = store;
  const collections = await catalogCollections(currency.code);
  if (collections.length < 2) return null;
  return (
    <Section reveal headingId="home-collections" title={t.home.collections.title}>
      <CollectionCards
        collections={collections}
        decimals={currency.decimals}
        t={t.home.collections}
        countText={(n) => plural(n, t.catalog.results, formatNumber(n))}
      />
    </Section>
  );
}

function CollectionsSkeleton({ title }: { title: string }) {
  return (
    <Section reveal headingId="home-collections" title={title}>
      <CollectionCardsSkeleton />
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
async function HowAndBestSellers() {
  const currency = await getCurrency();
  const t = store;
  const c = common;
  const list = await listStoreServices({ currency: currency.code, ...sortQuery("popular"), start: 0, end: MINI_CARDS });
  if (list.data.length === 0) return <HowAndMore t={t.home} more={null} />;
  const labels = serviceCardLabels(t, c);
  return (
    <HowAndMore
      t={t.home}
      action={<ViewAll sort="popular" />}
      more={
        <MiniGrid>
          {list.data.map((service) => (
            <ServiceCardMini key={service.id} service={service} decimals={currency.decimals} labels={labels} />
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
async function NewArrivals() {
  const currency = await getCurrency();
  const t = store;
  const c = common;
  const list = await listStoreServices({ currency: currency.code, ...sortQuery("newest"), start: 0, end: MINI_CARDS });
  if (list.data.length === 0) return null;
  const labels = serviceCardLabels(t, c);
  return (
    <Section reveal headingId="home-new-arrivals" title={t.home.newArrivals.title} actions={<ViewAll sort="newest" />}>
      <MiniGrid>
        {list.data.map((service) => (
          <ServiceCardMini key={service.id} service={service} decimals={currency.decimals} labels={labels} />
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
