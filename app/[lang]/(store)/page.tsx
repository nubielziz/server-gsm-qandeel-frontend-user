// Shop home (mockup "E-Commerce", adapted to the API): dark hero, quick IMEI check and track promo, featured services,
// brands, how it works and a preview of the catalog. The hero, quick check, promo and "how it works" are static. Everything
// that reads the catalog (language-specific cached reads) or the visitor's currency cookie streams in behind <Suspense>
// with skeletons; the merchant banner is a small Client Component (no server read).
import { Suspense } from "react";
import { ArrowRight, PackageSearch } from "lucide-react";
import { Container, Section } from "@/components/layout/container";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { serviceCardLabels } from "@/components/store/card-labels";
import { MerchantBanner } from "@/components/store/merchant-banner";
import { BrandChips, GuestPoint, HomeHero, HowItWorks, QuickImeiCard, TrackPromoCard } from "@/components/store/home-parts";
import { ServiceCard, ServiceGridSkeleton } from "@/components/store/service-card";
import { getStoreConfig, listStoreServices } from "@/lib/api/public";
import { catalogFacets } from "@/lib/catalog";
import { getCurrency } from "@/lib/currency";
import { localePath, type Locale } from "@/lib/i18n/config";
import { common } from "@/lib/i18n/messages/common";
import { store, type StoreMessages } from "@/lib/i18n/messages/store";
import { getLocale, getMessages } from "@/lib/i18n/server";

const GRID = "grid gap-4 sm:grid-cols-2 xl:grid-cols-4";
const SKELETON_CARDS = 4;

export default async function HomePage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages(store)]);

  return (
    <Container className="grid gap-10 py-6 lg:gap-12 lg:py-8">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <HomeHero
          locale={locale}
          t={t.home}
          thirdPoint={
            <Suspense fallback={<li aria-hidden="true" className="h-[1lh] w-36 rounded-badge bg-inverse-raised" />}>
              <GuestPointFromConfig t={t.home} />
            </Suspense>
          }
        />
        <div className="grid gap-4 lg:grid-rows-[auto_1fr]">
          <QuickImeiCard locale={locale} t={t.home} />
          <TrackPromoCard locale={locale} t={t.home} />
        </div>
      </div>

      <MerchantBanner text={t.home.merchant.text} cta={t.home.merchant.cta} href={localePath(locale, "/merchant/services")} />

      <Suspense fallback={<FeaturedSkeleton title={t.home.featured.title} description={t.home.featured.description} />}>
        <FeaturedAndBrands locale={locale} />
      </Suspense>

      <Section headingId="home-how" title={t.home.how.title}>
        <HowItWorks t={t.home.how} />
      </Section>

      <Suspense fallback={null}>
        <MoreServices locale={locale} />
      </Suspense>
    </Container>
  );
}

/** Whether an account is needed comes from the shop config (cached): streamed so the page shell stays static. */
async function GuestPointFromConfig({ t }: { t: StoreMessages["home"] }) {
  const config = await getStoreConfig();
  return <GuestPoint guestCheckout={config.policies.guestCheckout} t={t} />;
}

async function ViewAll({ locale }: { locale: Locale }) {
  const c = await getMessages(common);
  return (
    <ButtonLink href={localePath(locale, "/services")} variant="link" endIcon={<ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />}>
      {c.actions.viewAll}
    </ButtonLink>
  );
}

/** Featured services (priced in the visitor's currency) and the brand chips, or an empty state for an empty catalog. */
async function FeaturedAndBrands({ locale }: { locale: Locale }) {
  const [t, c, currency, facets] = await Promise.all([getMessages(store), getMessages(common), getCurrency(), catalogFacets(locale)]);
  const featured = await listStoreServices({ locale, currency: currency.code, featured: true, start: 0, end: 8 });
  const labels = serviceCardLabels(t, c);
  return (
    <>
      {featured.data.length > 0 ? (
        <Section headingId="home-featured" title={t.home.featured.title} description={t.home.featured.description} actions={<ViewAll locale={locale} />}>
          <div className={GRID}>
            {featured.data.map((service) => (
              <ServiceCard key={service.id} service={service} locale={locale} decimals={currency.decimals} labels={labels} />
            ))}
          </div>
        </Section>
      ) : facets.brands.length === 0 ? (
        <Card>
          <EmptyState icon={<PackageSearch aria-hidden="true" />} title={t.home.empty.title} description={t.home.empty.text} />
        </Card>
      ) : null}
      {facets.brands.length > 0 ? (
        <Section headingId="home-brands" title={t.home.brands.title} description={t.home.brands.description}>
          <BrandChips brands={facets.brands} locale={locale} chipLabel={t.home.brands.chipLabel} />
        </Section>
      ) : null}
    </>
  );
}

/** A selection of the other (not featured) services, by title. Nothing when every service is featured. */
async function MoreServices({ locale }: { locale: Locale }) {
  const [t, c, currency] = await Promise.all([getMessages(store), getMessages(common), getCurrency()]);
  const list = await listStoreServices({ locale, currency: currency.code, featured: false, sort: "title", start: 0, end: 8 });
  if (list.data.length === 0) return null;
  const labels = serviceCardLabels(t, c);
  return (
    <Section headingId="home-more" title={t.home.all.title} description={t.home.all.description} actions={<ViewAll locale={locale} />}>
      <div className={GRID}>
        {list.data.map((service) => (
          <ServiceCard key={service.id} service={service} locale={locale} decimals={currency.decimals} labels={labels} />
        ))}
      </div>
    </Section>
  );
}

/** The featured section's heading and a row of card skeletons while the catalog streams in. */
function FeaturedSkeleton({ title, description }: { title: string; description: string }) {
  return (
    <Section headingId="home-featured" title={title} description={description}>
      <ServiceGridSkeleton count={SKELETON_CARDS} className={GRID} />
    </Section>
  );
}
