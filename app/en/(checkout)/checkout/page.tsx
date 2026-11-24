// Opening a checkout: `/checkout?service=<slug>`. The page shell is static; the service (priced in the visitor's currency)
// and the URL stream in behind one <Suspense> with a same-size skeleton, and the signed-in account behind a second one
// inside it. The account read is personal and uncached (`no-store`): a prefetch stops at it. Kept in its own boundary,
// it leaves everything else to the per-link prefetch of "Buy now" (`prefetch={true}`, plan P3.1): the service's own
// states (moved, missing, file service) and, for a visitor without an account session (no read at all),
// the whole form. The form itself needs the account when it mounts, so for a signed-in account it streams in after the
// click, behind the same skeleton.
// The rank decides what the account sees (`checkoutAccess`): a retail rank gets the form with its email locked; a merchant
// rank gets its own order form at the same address, at its own price and paid from its wallet (decision 003), so the shop's
// form is never mounted for it and no checkout session is created. A file service has no shop checkout: everybody else gets
// the notice to order it through support (also while the account is read, so a guest sees it at once), a merchant rank its
// order form.
import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { PackageSearch, TriangleAlert } from "lucide-react";
import { Container, PageHeader } from "@/components/layout/container";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckoutForm, type CheckoutFormProps } from "@/components/checkout/checkout-form";
import { MerchantCheckout, type MerchantCheckoutProps } from "@/components/checkout/merchant-checkout";
import { resolveService } from "@/components/store/resolve-service";
import { firstParam, intParam, type SearchParams } from "@/components/store/search-params";
import { ServiceArt } from "@/components/store/service-art";
import { getStoreConfig } from "@/lib/api/public";
import { getAccount } from "@/lib/api/session";
import { checkoutAccess, checkoutBuyerOf, checkoutSignInHref } from "@/lib/checkout/access";
import { countryOptions } from "@/lib/countries";
import { getCurrency } from "@/lib/currency";
import { checkout } from "@/lib/i18n/messages/checkout";
import { common } from "@/lib/i18n/messages/common";
import { sitePath } from "@/lib/site-path";

export function generateMetadata(): Metadata {
  const t = checkout;
  return { title: t.meta.start, robots: { index: false, follow: false } };
}

export default function CheckoutPage(props: PageProps<"/en/checkout">) {
  const t = checkout;
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
  const params = await searchParams;
  const t = checkout;
  const c = common;
  const slug = firstParam(params.service, 200);
  // A restarted or resumed checkout carries `&quantity=`; every link below keeps it, and the form checks it against
  // today's rule (a quantity the rule no longer allows falls back to the default with a notice).
  const wanted = intParam(params.quantity);
  const quantityQuery = wanted === null ? "" : `&quantity=${wanted}`;
  const p = (path: string) => sitePath(path);
  const nextPath = `${p("/checkout")}?service=${encodeURIComponent(slug)}${quantityQuery}`;
  const signInHref = checkoutSignInHref(nextPath);

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
  const resolved = await resolveService(slug, currency.code);

  // An old address of the service (decision 039): the checkout of its page on sale now; none on sale is "not found".
  if (resolved.kind === "redirect" && resolved.slug) {
    permanentRedirect(`${p("/checkout")}?service=${encodeURIComponent(resolved.slug)}${quantityQuery}`);
  }
  if (resolved.kind !== "found") {
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
  const { service } = resolved;

  const fileNotice =
    service.type === "file" ? (
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
    ) : null;

  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = firstParam(params[`utm_${key}`], 100);
    if (value) utm[key] = value;
  }

  const form: Omit<CheckoutFormProps, "account"> = {
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
    countries: countryOptions(),
    signInHref,
    supportHref: p("/support"),
    utm,
    initialQuantity: wanted,
  };

  return (
    <Suspense fallback={fileNotice ?? <CheckoutSkeleton />}>
      <AccountCheckout
        // A new service or a new quantity in the URL starts the form over (no rule, details or notice of the last one).
        formKey={`${service.id}:${wanted ?? ""}`}
        form={form}
        fileNotice={fileNotice}
        guestCheckout={config.policies.guestCheckout}
        signIn={{ title: t.start.signInTitle, text: t.start.signInText, action: t.start.signInAction, href: signInHref }}
        merchant={{ serviceId: service.id, next: nextPath, serviceHref: p(`/services/${encodeURIComponent(service.slug)}`) }}
      />
    </Suspense>
  );
}

/**
 * The part of the checkout that needs the signed-in account (`GET /store/v1/me` or `GET /client/auth/me`, by the account's own
 * session, per request, never cached). `checkoutAccess` decides from the account's rank:
 * - for a merchant rank, its own order form (`MerchantCheckout`), for every type of service. The shop's form is never mounted,
 *   so no checkout session is created;
 * - for anybody else, a file service's notice (`fileNotice`), which the shop checkout does not sell;
 * - the form, with a retail account's email locked and its country prefilled (or empty, for a guest checkout);
 * - with guest checkout switched off and nobody signed in, the way to sign in.
 * Render it inside its own <Suspense> so the rest of the page stays in the prefetch.
 */
async function AccountCheckout({
  formKey,
  form,
  fileNotice,
  guestCheckout,
  signIn,
  merchant,
}: {
  formKey: string;
  form: Omit<CheckoutFormProps, "account">;
  /** The notice of a file service; null for every other service. */
  fileNotice: ReactNode;
  guestCheckout: boolean;
  signIn: { title: string; text: string; action: string; href: string };
  merchant: MerchantCheckoutProps;
}) {
  const me = await getAccount();
  const access = checkoutAccess(me, guestCheckout);

  if (access === "order-form") return <MerchantCheckout {...merchant} />;
  if (fileNotice) return fileNotice;
  if (access === "sign-in") {
    return (
      <Card>
        <EmptyState title={signIn.title} description={signIn.text} action={<ButtonLink href={signIn.href}>{signIn.action}</ButtonLink>} />
      </Card>
    );
  }
  return <CheckoutForm key={formKey} {...form} account={checkoutBuyerOf(me)} />;
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
