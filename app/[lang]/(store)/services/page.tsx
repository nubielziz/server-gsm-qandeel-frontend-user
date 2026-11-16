// The catalog: the same browsable list as the home page's "All services" (components/store/service-list.tsx): filter
// sidebar (categories, "In stock only", price range, service type, brand, carrier, country; a drawer on phones), search,
// six sorts (featured, best sellers, new arrivals, price both ways, name), chips, 24 cards a page. The API filters,
// sorts and pages the rows.
// The page shell is static; everything that depends on the URL (`searchParams`) or on the visitor's currency cookie
// streams in behind one <Suspense>. A search (`?q=`) is not for search engines (backend plan 29 §7, owner question 16):
// its metadata says `noindex` (robots.txt disallows it too); the catalog and its filter pages stay indexable. The
// metadata reads `searchParams`, so it is resolved at request time with the list (Next docs, generateMetadata, "With
// Cache Components": the page already defers its list to request time).
import { Suspense } from "react";
import type { Metadata } from "next";
import { PackageSearch } from "lucide-react";
import { firstParam, type SearchParams } from "@/components/store/search-params";
import { Container, PageHeader } from "@/components/layout/container";
import { PageTransition } from "@/components/layout/page-transition";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ServiceList, ServiceListSkeleton, loadServiceList, type ServiceListConfig } from "@/components/store/service-list";
import { localePath } from "@/lib/i18n/config";
import { store } from "@/lib/i18n/messages/store";
import { getLocale, getMessages } from "@/lib/i18n/server";

const CONFIG: ServiceListConfig = { path: "/services", perPage: 24, hash: "", cards: "full", drawerId: "catalog-filters" };

export async function generateMetadata(props: PageProps<"/[lang]/services">): Promise<Metadata> {
  const [locale, t, params] = await Promise.all([getLocale(), getMessages(store), props.searchParams]);
  const searched = firstParam(params.q) !== "";
  return {
    title: t.catalog.title,
    description: t.catalog.metaDescription,
    alternates: { canonical: localePath(locale, "/services"), languages: { en: "/en/services", ar: "/ar/services" } },
    // A search result page: not indexed, its links still followed.
    robots: searched ? { index: false, follow: true } : undefined,
  };
}

export default async function ServicesPage(props: PageProps<"/[lang]/services">) {
  const [locale, t] = await Promise.all([getLocale(), getMessages(store)]);
  return (
    <PageTransition>
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
        <div className="mt-6">
          <Suspense fallback={<ServiceListSkeleton config={CONFIG} rows={6} />}>
            <Catalog searchParams={props.searchParams} />
          </Suspense>
        </div>
      </Container>
    </PageTransition>
  );
}

async function Catalog({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const data = await loadServiceList(searchParams, CONFIG);
  const { locale, t } = data;
  if (data.list.catalogSize > 0) return <ServiceList data={data} config={CONFIG} />;
  // Nothing is listed in this language.
  return (
    <Card>
      {locale === "ar" ? (
        <EmptyState
          icon={<PackageSearch aria-hidden="true" />}
          title={t.catalog.arEmptyTitle}
          description={t.catalog.arEmptyText}
          action={
            <ButtonLink href={localePath("en", "/services")} variant="secondary">
              {t.catalog.arEmptyAction}
            </ButtonLink>
          }
        />
      ) : (
        <EmptyState icon={<PackageSearch aria-hidden="true" />} title={t.catalog.noneTitle} description={t.catalog.noneText} />
      )}
    </Card>
  );
}
