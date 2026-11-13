// The catalog: the same browsable list as the home page's "All services" (components/store/service-list.tsx): filter
// sidebar (categories, "In stock only", price range, service type, brand, carrier, country; a drawer on phones), search,
// six sorts (featured, best sellers, new arrivals, price both ways, name), chips, 24 cards a page. The API filters,
// sorts and pages the rows.
// The page shell is static; everything that depends on the URL (`searchParams`) or on the visitor's currency cookie
// streams in behind one <Suspense>.
import { Suspense } from "react";
import type { Metadata } from "next";
import { PackageSearch } from "lucide-react";
import { Container, PageHeader } from "@/components/layout/container";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { SearchParams } from "@/components/store/search-params";
import { ServiceList, ServiceListSkeleton, loadServiceList, type ServiceListConfig } from "@/components/store/service-list";
import { localePath } from "@/lib/i18n/config";
import { store } from "@/lib/i18n/messages/store";
import { getLocale, getMessages } from "@/lib/i18n/server";

const CONFIG: ServiceListConfig = { path: "/services", perPage: 24, hash: "", cards: "full", drawerId: "catalog-filters" };

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
      <div className="mt-6">
        <Suspense fallback={<ServiceListSkeleton config={CONFIG} rows={6} />}>
          <Catalog searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Container>
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
