// Opening a checkout: `/checkout?service=<slug>`. The page shell is static; the service (priced in the visitor's currency)
// and the URL stream in behind one <Suspense> with a same-size skeleton, and the signed-in customer behind a second one
// inside it. The customer read is personal and uncached (`no-store`): a prefetch stops at it. Kept in its own boundary,
// it leaves everything else to the per-link prefetch of "Buy now" (`prefetch={true}`, plan P3.1): the service's own
// states (moved, missing, other language, file service) and, for a visitor without a customer session (no read at all),
// the whole form. The form itself needs the customer when it mounts, so for a signed-in customer it streams in after the
// click, behind the same skeleton.
import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PackageSearch, TriangleAlert } from "lucide-react";
import { Container, PageHeader } from "@/components/layout/container";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckoutForm, type CheckoutFormProps } from "@/components/checkout/checkout-form";
import { resolveService } from "@/components/store/resolve-service";
import { firstParam, intParam, type SearchParams } from "@/components/store/search-params";
import { ServiceArt } from "@/components/store/service-art";
import { getStoreConfig } from "@/lib/api/public";
import { getCustomer } from "@/lib/api/session";
import { countryOptions } from "@/lib/countries";
import { getCurrency } from "@/lib/currency";
import { localePath } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { checkout } from "@/lib/i18n/messages/checkout";
import { common } from "@/lib/i18n/messages/common";
import { getLocale, getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(checkout);
  return { title: t.meta.start, robots: { index: false, follow: false } };
}

export default async function CheckoutPage(props: PageProps<"/[lang]/checkout">) {
  const t = await getMessages(checkout);
  return (
    <Container width="wide" className="py-8 lg:py-10">
      <PageHeader title={t.start.title} description={t.start.description} />
      <div className="mt-6">
        <Suspense fallback={<CheckoutSkeleton />}>
          <CheckoutContent searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Container>
  );
}

const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;

async function CheckoutContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, locale, t, c] = await Promise.all([searchParams, getLocale(), getMessages(checkout), getMessages(common)]);
  const slug = firstParam(params.service, 200);
  // A restarted or resumed checkout carries `&quantity=`; every link below keeps it, and the form checks it against
  // today's rule (a quantity the rule no longer allows falls back to the default with a notice).
  const wanted = intParam(params.quantity);
  const quantityQuery = wanted === null ? "" : `&quantity=${wanted}`;
  const p = (path: string) => localePath(locale, path);
  const nextPath = `${p("/checkout")}?service=${encodeURIComponent(slug)}${quantityQuery}`;
  const signInHref = `${p("/sign-in")}?as=customer&next=${encodeURIComponent(nextPath)}`;

  if (!slug) {
    return (
      <Card>
        <EmptyState
          icon={<PackageSearch aria-hidden="true" />}
          title={t.start.missingTitle}
          description={t.start.missingText}
          action={<ButtonLink href={p("/services")}>{t.start.missingAction}</ButtonLink>}
        />
      </Card>
    );
  }

  const [currency, config] = await Promise.all([getCurrency(), getStoreConfig()]);
  const resolved = await resolveService(slug, locale, currency.code);

  if (resolved.kind === "redirect") {
    redirect(`${p("/checkout")}?service=${encodeURIComponent(resolved.slug)}${quantityQuery}`);
  }
  if (resolved.kind === "missing") {
    return (
      <Card>
        <EmptyState
          icon={<PackageSearch aria-hidden="true" />}
          title={t.start.notFoundTitle}
          description={t.start.notFoundText}
          action={<ButtonLink href={p("/services")}>{t.start.missingAction}</ButtonLink>}
        />
      </Card>
    );
  }
  if (resolved.kind === "other-language") {
    const language = c.languageNames[resolved.locale];
    return (
      <Card>
        <EmptyState
          icon={<PackageSearch aria-hidden="true" />}
          title={t.start.otherLanguageTitle}
          description={fmt(t.start.otherLanguageText, { language })}
          action={
            <ButtonLink href={`${localePath(resolved.locale, "/checkout")}?service=${encodeURIComponent(resolved.slug)}${quantityQuery}`}>
              {fmt(t.start.otherLanguageAction, { language })}
            </ButtonLink>
          }
        />
      </Card>
    );
  }

  const { service } = resolved;

  if (service.type === "file") {
    return (
      <Alert
        tone="warning"
        icon={<TriangleAlert aria-hidden="true" />}
        title={t.start.fileTitle}
        action={
          <ButtonLink href={p("/support")} variant="secondary" size="sm">
            {t.start.fileAction}
          </ButtonLink>
        }
      >
        {t.start.fileText}
      </Alert>
    );
  }

  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = firstParam(params[`utm_${key}`], 100);
    if (value) utm[key] = value;
  }

  const form: Omit<CheckoutFormProps, "customer"> = {
    locale,
    labels: t.start,
    quantityLabels: c.quantity,
    deliveryLabels: c.delivery,
    typeLabel: c.serviceType[service.type],
    service: {
      id: service.id,
      slug: service.slug,
      title: service.title,
      isImei: service.type === "imei",
      quantity: service.quantity,
      availability: service.availability,
      etaText: service.etaText,
      deliveryMinutes: service.deliveryMinutes,
      fields: service.fields,
      price: service.price,
    },
    art: <ServiceArt type={service.type} sizes="96px" aspect="1 / 1" />,
    currencies: config.currencies,
    currency: currency.code,
    taxRates: config.taxRates,
    countries: countryOptions(locale),
    signInHref,
    supportHref: p("/support"),
    utm,
    initialQuantity: wanted,
  };

  return (
    <Suspense fallback={<CheckoutSkeleton />}>
      <CustomerCheckout
        // A new service or a new quantity in the URL starts the form over (no rule, details or notice of the last one).
        formKey={`${service.id}:${wanted ?? ""}`}
        form={form}
        guestCheckout={config.policies.guestCheckout}
        signIn={{ title: t.start.signInTitle, text: t.start.signInText, action: t.start.signInAction, href: signInHref }}
      />
    </Suspense>
  );
}

/**
 * The part of the checkout that needs the signed-in customer (`GET /store/v1/me`, per request, never cached): the form
 * (their email locked, their country prefilled) or, with guest checkout switched off and nobody signed in, the way to
 * sign in. Render it inside its own <Suspense> so the rest of the page stays in the prefetch.
 */
async function CustomerCheckout({
  formKey,
  form,
  guestCheckout,
  signIn,
}: {
  formKey: string;
  form: Omit<CheckoutFormProps, "customer">;
  guestCheckout: boolean;
  signIn: { title: string; text: string; action: string; href: string };
}) {
  const customer = await getCustomer();

  // Guest checkout switched off: only a signed-in customer can open a checkout.
  if (!guestCheckout && !customer) {
    return (
      <Card>
        <EmptyState title={signIn.title} description={signIn.text} action={<ButtonLink href={signIn.href}>{signIn.action}</ButtonLink>} />
      </Card>
    );
  }

  return <CheckoutForm key={formKey} {...form} customer={customer ? { email: customer.email, country: customer.country } : null} />;
}

/** Same layout as the form: two cards on the left, the summary on the right. */
function CheckoutSkeleton() {
  return (
    <div aria-busy="true" aria-hidden="true" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="grid gap-6">
        <Skeleton className="h-[15.5rem] rounded-card" />
        <Skeleton className="h-[30rem] rounded-card sm:h-[24rem]" />
      </div>
      <Skeleton className="h-[31rem] rounded-card" />
    </div>
  );
}
