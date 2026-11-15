// The quick view of a service, shown in a dialog over the page (app/[lang]/(store)/@modal/(.)quick-view/[slug]): its
// title, a body (art, type and chips, summary, price in the visitor's currency with "per unit", "From" and the packs,
// availability, delivery and quantity rules, description and requirements) and the actions (Buy now, full details).
// Each part reads the route params, so each streams in behind its own <Suspense>; the service read is cached and shared
// (no cookie), so for a prerendered slug the title, body and actions are in the static output and a prefetch carries
// them. Only the price reads the currency cookie: it is `ServicePrice`, in its own <Suspense>, rendered on the click
// (plan P3.3). The mockup's stock number, favourites and cart do not exist in the API (handoff §1.7).
import { Suspense } from "react";
import { ArrowRight, MapPin, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { Skeleton } from "@/components/ui/skeleton";
import type { StoreServiceDetail } from "@/lib/api/types";
import { countryName } from "@/lib/countries";
import { localePath } from "@/lib/i18n/config";
import { common } from "@/lib/i18n/messages/common";
import { store } from "@/lib/i18n/messages/store";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { demoteHeadings } from "./markdown-source";
import { resolveService } from "./resolve-service";
import { ServiceArt } from "./service-art";
import { PriceBlock, ServicePrice, serviceFacts, serviceStockHint } from "./service-parts";

type Params = Promise<{ slug: string }>;

/**
 * The service of the URL in this language; null when it is not listed in this language. A shared cached read (the base
 * currency, no cookie): the title, texts and links do not depend on the visitor. The price comes from `ServicePrice`.
 */
async function load(params: Params) {
  const [{ slug }, locale] = await Promise.all([params, getLocale()]);
  const resolved = await resolveService(slug, locale);
  let service: StoreServiceDetail | null = resolved.kind === "found" ? resolved.service : null;
  // A slug of the other language: the same service in this language.
  if (resolved.kind === "redirect") {
    const own = await resolveService(resolved.slug, locale);
    service = own.kind === "found" ? own.service : null;
  }
  return { locale, service };
}

/** The dialog's title: the service name. */
export async function QuickViewTitle({ params }: { params: Params }) {
  const [{ service }, t] = await Promise.all([load(params), getMessages(store)]);
  return <>{service ? service.title : t.quickView.missingTitle}</>;
}

export async function QuickViewBody({ params }: { params: Params }) {
  const [{ locale, service }, t, c] = await Promise.all([load(params), getMessages(store), getMessages(common)]);
  if (!service) return <p className="text-body text-ink-muted">{t.quickView.missingText}</p>;

  const chips = [service.brand, service.network, service.country ? countryName(service.country, locale) : ""].filter(Boolean);
  const place = [service.network, service.country ? countryName(service.country, locale) : ""].filter(Boolean).join(" · ");
  const description = service.descriptionMd.trim();
  const requirements = service.requirementsMd.trim();
  const facts = [
    ...serviceFacts(service, locale, t, c),
    ...(place ? [{ key: "place", icon: MapPin, label: t.quickView.place, value: <bdi>{place}</bdi> }] : []),
  ];
  const hint = serviceStockHint(service, locale, c);

  return (
    <div className="grid gap-6">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-start">
        <div className="overflow-hidden rounded-card border border-line">
          <ServiceArt type={service.type} imageUrl={service.imageUrl} brand={service.brand} sizes="(min-width: 640px) 15rem, 90vw" aspect="4 / 3" />
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
            <div className="mt-1">
              <Suspense fallback={<PriceBlock pending rule={service.quantity} locale={locale} q={c.quantity} t={t.service} />}>
                <ServicePrice slug={service.slug} />
              </Suspense>
            </div>
            <p className="mt-1.5 text-caption text-ink-subtle">{t.service.taxNote}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-card bg-surface-muted p-4">
        <dl className="grid gap-x-6 gap-y-3 text-small sm:grid-cols-2">
          {facts.map(({ key, icon: Icon, label, value }) => (
            <div key={key} className="flex items-start justify-between gap-4 sm:justify-start sm:gap-2.5">
              <dt className="flex items-center gap-2 text-ink-muted">
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {label}
              </dt>
              <dd className="min-w-0 text-end font-semibold text-ink sm:text-start">{value}</dd>
            </div>
          ))}
        </dl>
        {hint ? <p className="text-small text-ink-subtle">{hint}</p> : null}
      </div>

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
        // prefetch: the checkout's service summary and form come with the prefetch (plan P3.1).
        <ButtonLink href={`${localePath(locale, "/checkout")}?service=${slug}`} prefetch startIcon={<ShoppingCart aria-hidden="true" />}>
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
