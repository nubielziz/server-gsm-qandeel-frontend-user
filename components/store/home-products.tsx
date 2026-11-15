// "All services" on the home page (mockup "All Products"): the shared service list (./service-list.tsx) with 8 dense
// cards per page, in a section with its heading and a link to the catalog page with the same filters. No filter panel
// (owner decision, plan P3.4): the list's "Filters" button links to the catalog, where the filters are. Its state is the
// home URL (`/en?category=4-carrier-unlock&stock=1&type=imei&brand=Apple&max=20&sort=popular&page=2#all-services`: the
// same parameters as `/services`, whose rows the API filters, sorts and pages); the search, chip and page links end
// with the section's anchor so its top comes into view.
import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { pageHref } from "@/components/ui/pagination";
import { localePath } from "@/lib/i18n/config";
import { plural } from "@/lib/i18n/define";
import { formatNumber } from "@/lib/format";
import type { StoreMessages } from "@/lib/i18n/messages/store";
import type { SearchParams } from "./search-params";
import { ServiceList, ServiceListSkeleton, loadServiceList, type ServiceListConfig } from "./service-list";

export const ALL_SERVICES_ID = "all-services";
const HEADING_ID = "home-all-services";

// No `drawerId`: no filter panel on the home page.
const CONFIG: ServiceListConfig = { path: "", perPage: 8, hash: `#${ALL_SERVICES_ID}`, cards: "mini" };

export async function HomeProducts({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const data = await loadServiceList(searchParams, CONFIG);
  // Nothing is listed in this language: the featured section already says so.
  if (data.list.catalogSize === 0) return null;
  const { locale, t } = data;
  return (
    <section id={ALL_SERVICES_ID} aria-labelledby={HEADING_ID} className="grid scroll-mt-6 gap-4">
      <SectionHeading
        t={t.home.products}
        total={plural(locale, data.list.catalogSize, t.catalog.results, formatNumber(data.list.catalogSize, locale))}
        catalogHref={pageHref(localePath(locale, "/services"), data.state, 1)}
      />
      <ServiceList data={data} config={CONFIG} />
    </section>
  );
}

/** "All services (11 services)" and the link to the catalog page with the same filters. */
function SectionHeading({ t, total, catalogHref }: { t: StoreMessages["home"]["products"]; total?: string; catalogHref?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <h2 id={HEADING_ID} className="text-heading text-ink">
        {t.title}
        {total ? <span className="ms-2 text-body font-normal text-ink-subtle">({total})</span> : null}
      </h2>
      {catalogHref ? (
        <ButtonLink
          href={catalogHref}
          variant="ghost"
          size="sm"
          className="-me-3.5 -mb-1.5"
          endIcon={<ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />}
        >
          {t.openCatalog}
        </ButtonLink>
      ) : null}
    </div>
  );
}

/** The same frame while the list streams in. */
export function HomeProductsSkeleton({ t }: { t: StoreMessages["home"]["products"] }) {
  return (
    <section id={ALL_SERVICES_ID} aria-labelledby={HEADING_ID} aria-busy="true" className="grid scroll-mt-6 gap-4">
      <SectionHeading t={t} />
      <ServiceListSkeleton config={CONFIG} />
    </section>
  );
}
