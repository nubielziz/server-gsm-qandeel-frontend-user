// A service page: art, title, chips, price (visitor currency), delivery and quantity rules, "Buy now", description,
// requirements and FAQ. `params` is read behind <Suspense>; the price and the merchant hint stream in behind their own.
// A slug of the other language redirects to this language's slug of the same service (matched by id), else 404.
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Clock, Hash, TriangleAlert } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { staticSlugParams } from "@/components/store/static-params";
import { demoteHeadings } from "@/components/store/markdown-source";
import { resolveService, otherLocale } from "@/components/store/resolve-service";
import { ServiceArt } from "@/components/store/service-art";
import { Accordion, MerchantPriceHint, ServicePrice, quantityText } from "@/components/store/service-parts";
import { countryName } from "@/lib/countries";
import { allListedServices, slugForService } from "@/lib/catalog";
import { localePath } from "@/lib/i18n/config";
import { common } from "@/lib/i18n/messages/common";
import { store } from "@/lib/i18n/messages/store";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { siteImage } from "@/lib/site-images";

/** Also the metadata of a quick view link opened directly (../../quick-view/[slug]): only `params.slug` is read. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getLocale()]);
  const resolved = await resolveService(slug, locale);
  if (resolved.kind !== "found") return { robots: { index: false } };
  const { service } = resolved;
  const other = otherLocale(locale);
  const otherSlug = await slugForService(service.id, other);
  const own = localePath(locale, `/services/${encodeURIComponent(service.slug)}`);
  const languages: Record<string, string> = { [locale]: own };
  if (otherSlug) languages[other] = localePath(other, `/services/${encodeURIComponent(otherSlug)}`);
  const title = service.seoTitle || service.title;
  const description = service.seoDescription || service.summary || undefined;
  const og = siteImage("og-default.jpg");
  return {
    title,
    description,
    alternates: { canonical: own, languages },
    openGraph: { title, description, type: "website", locale, images: og ? [{ url: og }] : undefined },
  };
}

/** Every listed service of the language is prerendered (its content joins the static shell); other slugs render on demand. */
export async function generateStaticParams() {
  try {
    const rows = await allListedServices(await getLocale());
    return staticSlugParams(rows.map((row) => row.slug));
  } catch {
    // The API is unreachable at build time: every service page renders on demand instead.
    return staticSlugParams([]);
  }
}

export default function ServicePage(props: PageProps<"/[lang]/services/[slug]">) {
  return (
    <Container className="py-8 lg:py-10">
      <Suspense fallback={<ServiceSkeleton />}>
        <ServiceContent params={props.params} />
      </Suspense>
    </Container>
  );
}

async function ServiceContent({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, locale, t, c] = await Promise.all([params, getLocale(), getMessages(store), getMessages(common)]);
  const resolved = await resolveService(slug, locale);
  if (resolved.kind === "redirect") redirect(localePath(locale, `/services/${encodeURIComponent(resolved.slug)}`));
  if (resolved.kind !== "found") notFound();
  const { service } = resolved;

  const chips = [service.brand, service.network, service.country ? countryName(service.country, locale) : ""].filter(Boolean);
  const checkoutHref = `${localePath(locale, "/checkout")}?service=${encodeURIComponent(service.slug)}`;
  const buyable = service.type !== "file";
  const hasDetails = Boolean(service.descriptionMd.trim() || service.requirementsMd.trim() || service.faqs.length > 0);
  const eta = service.etaText || service.deliveryTime;

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
          <ServiceArt type={service.type} brand={service.brand} sizes="(min-width: 1024px) 40vw, 100vw" aspect="21 / 9" fit="contain" priority />
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
                <div className="mt-1 text-stat text-ink">
                  <Suspense fallback={<Skeleton className="h-[1lh] w-36" />}>
                    <ServicePrice slug={service.slug} />
                  </Suspense>
                </div>
                <p className="mt-1.5 text-small text-ink-subtle">{t.service.taxNote}</p>
              </div>
              <dl className="grid gap-3 border-y border-line py-4 text-body">
                <div className="flex items-start justify-between gap-4">
                  <dt className="flex items-center gap-2 text-ink-muted">
                    <Clock aria-hidden="true" className="size-4 shrink-0" />
                    {eta === service.deliveryTime ? t.service.delivery : t.service.eta}
                  </dt>
                  <dd className="min-w-0 text-end font-semibold text-ink">
                    <bdi>{eta}</bdi>
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="flex items-center gap-2 text-ink-muted">
                    <Hash aria-hidden="true" className="size-4 shrink-0" />
                    {t.service.quantity}
                  </dt>
                  <dd className="min-w-0 text-end font-semibold text-ink">{quantityText(service.quantity, locale, t.service)}</dd>
                </div>
              </dl>
              {buyable ? (
                <div className="grid gap-3">
                  <ButtonLink href={checkoutHref} size="lg" block endIcon={<ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />}>
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
