// The quick view of a service, shown in a dialog over the page (app/[lang]/(store)/@modal/(.)quick-view/[slug]): its
// title, a body (art, type and chips, summary, price in the visitor's currency, delivery and quantity rules,
// description and requirements) and the actions (Buy now, full details). Each part reads the route params and the
// currency cookie, so each streams in behind its own <Suspense>; the service read is cached, so the parts share it.
// The mockup's stock, favourites and cart do not exist in the API (handoff §1.7).
import { ArrowRight, Clock, Hash, MapPin, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { getStoreService } from "@/lib/api/public";
import type { StoreServiceDetail } from "@/lib/api/types";
import { countryName } from "@/lib/countries";
import { getCurrency } from "@/lib/currency";
import { localePath } from "@/lib/i18n/config";
import { common } from "@/lib/i18n/messages/common";
import { store } from "@/lib/i18n/messages/store";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { demoteHeadings } from "./markdown-source";
import { resolveService } from "./resolve-service";
import { ServiceArt } from "./service-art";
import { quantityText } from "./service-parts";

type Params = Promise<{ slug: string }>;

/** The service of the URL in this language and the visitor's currency; null when it is not listed in this language. */
async function load(params: Params) {
  const [{ slug }, locale, currency] = await Promise.all([params, getLocale(), getCurrency()]);
  const resolved = await resolveService(slug, locale, currency.code);
  let service: StoreServiceDetail | null = resolved.kind === "found" ? resolved.service : null;
  // A slug of the other language: the same service in this language.
  if (resolved.kind === "redirect") service = await getStoreService(resolved.slug, { locale, currency: currency.code });
  return { locale, currency, service };
}

/** The dialog's title: the service name. */
export async function QuickViewTitle({ params }: { params: Params }) {
  const [{ service }, t] = await Promise.all([load(params), getMessages(store)]);
  return <>{service ? service.title : t.quickView.missingTitle}</>;
}

export async function QuickViewBody({ params }: { params: Params }) {
  const [{ locale, currency, service }, t, c] = await Promise.all([load(params), getMessages(store), getMessages(common)]);
  if (!service) return <p className="text-body text-ink-muted">{t.quickView.missingText}</p>;

  const chips = [service.brand, service.network, service.country ? countryName(service.country, locale) : ""].filter(Boolean);
  const place = [service.network, service.country ? countryName(service.country, locale) : ""].filter(Boolean).join(" · ");
  const eta = service.etaText || service.deliveryTime;
  const description = service.descriptionMd.trim();
  const requirements = service.requirementsMd.trim();
  const facts = [
    { icon: Clock, label: eta === service.deliveryTime ? t.service.delivery : t.service.eta, value: eta },
    { icon: Hash, label: t.service.quantity, value: quantityText(service.quantity, locale, t.service) },
    ...(place ? [{ icon: MapPin, label: t.quickView.place, value: place }] : []),
  ];

  return (
    <div className="grid gap-6">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-start">
        <div className="overflow-hidden rounded-card border border-line">
          <ServiceArt type={service.type} brand={service.brand} sizes="(min-width: 640px) 15rem, 90vw" aspect="4 / 3" />
        </div>
        <div className="grid min-w-0 content-start gap-3">
          <ul className="flex flex-wrap items-center gap-2">
            <li>
              <Badge tone="inverse" shape="tag">
                {c.serviceType[service.type]}
              </Badge>
            </li>
            {chips.map((chip) => (
              <li key={chip}>
                <Badge tone="outline" shape="tag">
                  <bdi>{chip}</bdi>
                </Badge>
              </li>
            ))}
          </ul>
          {service.summary ? <p className="text-body text-ink-muted">{service.summary}</p> : null}
          <div>
            <p className="text-small font-semibold text-ink-muted">{t.service.priceLabel}</p>
            <Money amount={service.price.gross} currency={service.price.currency} locale={locale} decimals={currency.decimals} className="text-stat text-ink" />
            <p className="mt-1 text-caption text-ink-subtle">{t.service.taxNote}</p>
          </div>
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-3 rounded-card bg-surface-muted p-4 text-small sm:grid-cols-2">
        {facts.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-start justify-between gap-4 sm:justify-start sm:gap-2.5">
            <dt className="flex items-center gap-2 text-ink-muted">
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {label}
            </dt>
            <dd className="min-w-0 text-end font-semibold text-ink sm:text-start">
              <bdi>{value}</bdi>
            </dd>
          </div>
        ))}
      </dl>

      {description ? (
        <section aria-labelledby="quick-view-description">
          <h3 id="quick-view-description" className="text-subheading text-ink">
            {t.service.description}
          </h3>
          <Markdown source={demoteHeadings(description)} className="mt-2" />
        </section>
      ) : null}
      {requirements ? (
        <section aria-labelledby="quick-view-requirements">
          <h3 id="quick-view-requirements" className="text-subheading text-ink">
            {t.service.requirements}
          </h3>
          <Markdown source={demoteHeadings(requirements)} className="mt-2" />
        </section>
      ) : null}
      {!description && !requirements ? <p className="text-small text-ink-subtle">{t.service.noDetailsText}</p> : null}
    </div>
  );
}

/** The footer: the service page and Buy now (file services are ordered through support), or the catalog. */
export async function QuickViewActions({ params }: { params: Params }) {
  const [{ locale, service }, t] = await Promise.all([load(params), getMessages(store)]);
  if (!service) {
    return <ButtonLink href={localePath(locale, "/services")}>{t.quickView.browse}</ButtonLink>;
  }
  const slug = encodeURIComponent(service.slug);
  return (
    <>
      <ButtonLink href={localePath(locale, `/services/${slug}`)} variant="secondary" endIcon={<ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />}>
        {t.quickView.details}
      </ButtonLink>
      {service.type === "file" ? (
        <ButtonLink href={localePath(locale, "/support")}>{t.service.fileCta}</ButtonLink>
      ) : (
        <ButtonLink href={`${localePath(locale, "/checkout")}?service=${slug}`} startIcon={<ShoppingCart aria-hidden="true" />}>
          {t.service.buyNow}
        </ButtonLink>
      )}
    </>
  );
}

/** The title's line while it loads. */
export function QuickViewTitleSkeleton() {
  return <Skeleton aria-hidden="true" className="inline-block h-[1lh] w-56 max-w-full align-top" />;
}

/** The body's layout while it loads: art, chips, summary, price, facts. */
export function QuickViewBodySkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-6">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-start">
        <Skeleton className="aspect-[4/3] h-auto rounded-card" />
        <div className="grid content-start gap-3">
          <Skeleton className="h-6 w-40" />
          <div className="text-body">
            <Skeleton className="h-[1lh] w-4/5" />
          </div>
          <Skeleton className="h-4 w-12" />
          <div className="text-stat">
            <Skeleton className="h-[1lh] w-32" />
          </div>
        </div>
      </div>
      <Skeleton className="h-[4.5rem] rounded-card" />
    </div>
  );
}

/** The two buttons of the footer while they load. */
export function QuickViewActionsSkeleton() {
  return (
    <>
      <Skeleton aria-hidden="true" className="h-11 w-40 rounded-control" />
      <Skeleton aria-hidden="true" className="h-11 w-32 rounded-control" />
    </>
  );
}
