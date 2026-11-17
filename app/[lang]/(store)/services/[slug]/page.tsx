// A service page: art (the service's own picture, else brand logo, else type picture), title, chips, price (visitor
// currency, with "per unit", "From" and the packs), availability, delivery and quantity rules, "Buy now", description,
// requirements and FAQ. `params` is read behind <Suspense>; the price and the merchant hint stream in behind their own
// and wait for the navigation (`navigation()`), so a prefetch of a prerendered slug is served from the static output.
// An old address (a retired Arabic page, decision 039) sends the reader on to the service's page, else to the list
// (`resolveService`, plan 30 §7.1); it streams, so it is an instant redirect inside a 200 answer that is `noindex`.
// An unknown slug is a 404.
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { Container } from "@/components/layout/container";
import { PageTransition } from "@/components/layout/page-transition";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { demoteHeadings } from "@/components/store/markdown-source";
import { resolveService } from "@/components/store/resolve-service";
import { ServiceArt } from "@/components/store/service-art";
import {
  Accordion,
  MerchantPriceHint,
  PriceBlock,
  ServicePrice,
  serviceFacts,
  serviceStockHint,
} from "@/components/store/service-parts";
import { serviceStaticParams } from "@/components/store/service-static-params";
import { countryName } from "@/lib/countries";
import { localePath } from "@/lib/i18n/config";
import { common } from "@/lib/i18n/messages/common";
import { store } from "@/lib/i18n/messages/store";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { siteImage } from "@/lib/site-images";

/** Also the metadata of a quick view link opened directly (../../quick-view/[slug]): only `params.slug` is read. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getLocale()]);
  const resolved = await resolveService(slug);
  // Not found and old addresses alike: the answer before the redirect or the 404 is never indexed (plan 30 §7.1).
  if (resolved.kind !== "found") return { robots: { index: false } };
  const { service } = resolved;
  const own = localePath(locale, `/services/${encodeURIComponent(service.slug)}`);
  const title = service.seoTitle || service.title;
  const description = service.seoDescription || service.summary || undefined;
  const og = siteImage("og-default.jpg");
  return {
    title,
    description,
    alternates: { canonical: own },
    openGraph: { title, description, type: "website", locale: "en_US", images: og ? [{ url: og }] : undefined },
  };
}

/**
 * At most 50 services are prerendered (their content joins the static shell): the featured ones first, then
 * the API's order (plan D20). The rest render on demand, so a build through the shop host stays under its request limit.
 * The quick view dialog prerenders the same slugs.
 */
export async function generateStaticParams() {
  return serviceStaticParams();
}

export default function ServicePage(props: PageProps<"/[lang]/services/[slug]">) {
  return (
    <PageTransition>
      <Container className="py-8 lg:py-10">
        <Suspense fallback={<ServiceSkeleton />}>
          <ServiceContent params={props.params} />
        </Suspense>
      </Container>
    </PageTransition>
  );
}

async function ServiceContent({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, locale, t, c] = await Promise.all([params, getLocale(), getMessages(store), getMessages(common)]);
  const resolved = await resolveService(slug);
  if (resolved.kind === "redirect") permanentRedirect(localePath(locale, resolved.path));
  if (resolved.kind !== "found") notFound();
  const { service } = resolved;

  const chips = [service.brand, service.network, service.country ? countryName(service.country, locale) : ""].filter(Boolean);
  const checkoutHref = `${localePath(locale, "/checkout")}?service=${encodeURIComponent(service.slug)}`;
  const buyable = service.type !== "file";
  const hasDetails = Boolean(service.descriptionMd.trim() || service.requirementsMd.trim() || service.faqs.length > 0);
  const facts = serviceFacts(service, locale, t, c);
  const hint = serviceStockHint(service, locale, c);

  return (
    <>
      <Breadcrumbs
        label={c.workspace.breadcrumbLabel}
        items={[
          { label: t.service.breadcrumbHome, href: localePath(locale) },
          { label: t.service.breadcrumbServices, href: localePath(locale, "/services") },
          { label: service.title },
        ]}
      />
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <header className="min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-card lg:col-start-1">
          <ServiceArt
            type={service.type}
            imageUrl={service.imageUrl}
            brand={service.brand}
            sizes="(min-width: 1024px) 40vw, 100vw"
            aspect="21 / 9"
            fit="contain"
            priority
          />
          <div className="grid gap-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="inverse" shape="tag">
                {c.serviceType[service.type]}
              </Badge>
            </div>
            <h1 className="text-title text-ink">{service.title}</h1>
            {service.summary ? <p className="max-w-2xl text-subheading font-normal text-ink-muted">{service.summary}</p> : null}
            {chips.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <li key={chip}>
                    <Badge tone="outline" shape="tag">
                      {chip}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </header>

        <aside aria-label={t.service.aboutOrder} className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start lg:sticky lg:top-6">
          <Card>
            <CardBody className="grid gap-5">
              <div>
                <p className="text-small font-semibold text-ink-muted">{t.service.priceLabel}</p>
                <div className="mt-1">
                  <Suspense fallback={<PriceBlock pending rule={service.quantity} locale={locale} q={c.quantity} t={t.service} />}>
                    <ServicePrice slug={service.slug} />
                  </Suspense>
                </div>
                <p className="mt-1.5 text-small text-ink-subtle">{t.service.taxNote}</p>
              </div>
              <div className="grid gap-3 border-y border-line py-4">
                <dl className="grid gap-3 text-body">
                  {facts.map(({ key, icon: Icon, label, value }) => (
                    <div key={key} className="flex items-start justify-between gap-4">
                      <dt className="flex items-center gap-2 text-ink-muted">
                        <Icon aria-hidden="true" className="size-4 shrink-0" />
                        {label}
                      </dt>
                      <dd className="min-w-0 text-end font-semibold text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
                {hint ? <p className="text-small text-ink-subtle">{hint}</p> : null}
              </div>
              {buyable ? (
                <div className="grid gap-3">
                  {/* prefetch: the checkout's service summary and form come with the prefetch (plan P3.1). */}
                  <ButtonLink
                    href={checkoutHref}
                    prefetch
                    size="lg"
                    block
                    endIcon={<ArrowRight aria-hidden="true" />}
                  >
                    {t.service.buyNow}
                  </ButtonLink>
                  <p className="text-small text-ink-subtle">{t.service.afterPay}</p>
                </div>
              ) : (
                <Alert
                  tone="warning"
                  icon={<TriangleAlert aria-hidden="true" />}
                  title={t.service.fileTitle}
                  action={undefined}
                >
                  <p>{t.service.fileText}</p>
                  <ButtonLink href={localePath(locale, "/support")} variant="secondary" size="sm" className="mt-3">
                    {t.service.fileCta}
                  </ButtonLink>
                </Alert>
              )}
              <Suspense fallback={null}>
                <MerchantPriceHint serviceId={service.id} />
              </Suspense>
            </CardBody>
          </Card>
        </aside>

        <div className="grid min-w-0 gap-6 lg:col-start-1">
          {service.descriptionMd.trim() ? (
            <section aria-labelledby="service-description" className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
              <h2 id="service-description" className="text-heading text-ink">
                {t.service.description}
              </h2>
              <Markdown source={demoteHeadings(service.descriptionMd)} className="mt-3" />
            </section>
          ) : null}
          {service.requirementsMd.trim() ? (
            <section aria-labelledby="service-requirements" className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
              <h2 id="service-requirements" className="text-heading text-ink">
                {t.service.requirements}
              </h2>
              <Markdown source={demoteHeadings(service.requirementsMd)} className="mt-3" />
            </section>
          ) : null}
          {service.faqs.length > 0 ? (
            <section aria-labelledby="service-faq" className="grid gap-3">
              <h2 id="service-faq" className="text-heading text-ink">
                {t.service.faq}
              </h2>
              <Accordion items={service.faqs.map((faq, i) => ({ id: i, question: faq.question, answerMd: faq.answerMd }))} />
            </section>
          ) : null}
          {!hasDetails ? (
            <section className="rounded-card border border-dashed border-line-strong p-5 sm:p-6">
              <h2 className="text-subheading text-ink">{t.service.noDetailsTitle}</h2>
              <p className="mt-1 text-body text-ink-muted">{t.service.noDetailsText}</p>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}

/** Same layout as the loaded page (for a service without long text): breadcrumb, art + title card, purchase card, details. */
function ServiceSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="h-5 w-64" />
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div aria-hidden="true" className="overflow-hidden rounded-card border border-line bg-surface shadow-card lg:col-start-1">
          <Skeleton className="aspect-[21/9] h-auto rounded-none" />
          <div className="grid gap-4 p-5 sm:p-6">
            <Skeleton className="h-6 w-24" />
            <div className="text-title">
              <Skeleton className="h-[1lh] w-3/4" />
            </div>
            <div className="text-subheading">
              <Skeleton className="h-[1lh] w-1/2" />
            </div>
            <Skeleton className="h-6 w-56" />
          </div>
        </div>
        <div aria-hidden="true" className="grid content-start gap-5 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Skeleton className="h-[5.5rem]" />
          <Skeleton className="h-[5.5rem]" />
          <Skeleton className="h-12" />
        </div>
        <Skeleton aria-hidden="true" className="h-[6.5rem] rounded-card lg:col-start-1" />
      </div>
    </div>
  );
}
