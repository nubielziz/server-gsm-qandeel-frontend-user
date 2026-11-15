// The link in the abandoned-checkout email (`/checkout/resume?token=`): shows what was left and opens a NEW checkout at
// today's price (a session cannot prefill the IMEI or email: the API masks them and returns no inputs).
import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { PackageSearch, SearchX } from "lucide-react";
import { Container, PageHeader } from "@/components/layout/container";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { otherLocale } from "@/components/store/resolve-service";
import { firstParam, type SearchParams } from "@/components/store/search-params";
import { isApiError } from "@/lib/api/errors";
import { BusyState } from "@/components/ui/busy-state";
import { getStoreConfig } from "@/lib/api/public";
import { apiSessionGet } from "@/lib/api/server";
import type { CheckoutSession } from "@/lib/api/types";
import { slugForService } from "@/lib/catalog";
import { localePath } from "@/lib/i18n/config";
import { slot } from "@/components/checkout/rich";
import { checkout } from "@/lib/i18n/messages/checkout";
import { common } from "@/lib/i18n/messages/common";
import { getLocale, getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(checkout);
  return { title: t.meta.resume, robots: { index: false, follow: false } };
}

export default async function CheckoutResumePage(props: PageProps<"/[lang]/checkout/resume">) {
  const t = await getMessages(checkout);
  return (
    <Container width="narrow" className="py-8 lg:py-10">
      <PageHeader title={t.resume.title} description={t.resume.description} />
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-72 rounded-card" />}>
          <Resume searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Container>
  );
}

async function Resume({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, locale, t, c] = await Promise.all([searchParams, getLocale(), getMessages(checkout), getMessages(common)]);
  const token = firstParam(params.token, 128);
  const p = (path: string) => localePath(locale, path);

  const notFound = (
    <Card>
      <EmptyState
        icon={<SearchX aria-hidden="true" />}
        title={t.resume.notFoundTitle}
        description={t.resume.notFoundText}
        action={<ButtonLink href={p("/services")}>{t.resume.browse}</ButtonLink>}
      />
    </Card>
  );
  if (!token) return notFound;

  // A per-visitor read of a token route: request time by nature (also keeps Next's prerender check from tripping on the fetch).
  await connection();
  let session: CheckoutSession;
  try {
    session = await apiSessionGet<CheckoutSession>(`/store/v1/checkout-sessions/${encodeURIComponent(token)}`);
  } catch (error) {
    if (isApiError(error) && (error.status === 404 || error.status === 422)) return notFound;
    if (isApiError(error) && error.status === 429) {
      return <BusyState error={error} retryHref={`${p("/checkout/resume")}?token=${encodeURIComponent(token)}`} />;
    }
    throw error;
  }

  if (session.status === "paid") {
    return (
      <Alert
        tone="success"
        title={t.resume.paidTitle}
        action={
          session.trackingToken ? (
            <ButtonLink href={p(`/track/${encodeURIComponent(session.trackingToken)}`)} size="sm">
              {t.resume.paidAction}
            </ButtonLink>
          ) : undefined
        }
      >
        {t.resume.paidText}
      </Alert>
    );
  }

  // The service may be listed in this language, the other one, or no longer at all.
  const [config, own] = await Promise.all([getStoreConfig(), slugForService(session.service.id, locale)]);
  const other = own ? null : await slugForService(session.service.id, otherLocale(locale));
  // The new checkout keeps the quantity of the unfinished one: the form checks it against today's rule.
  const quantityQuery = `&quantity=${session.quantity}`;
  const href = own
    ? `${p("/checkout")}?service=${encodeURIComponent(own)}${quantityQuery}`
    : other
      ? `${localePath(otherLocale(locale), "/checkout")}?service=${encodeURIComponent(other)}${quantityQuery}`
      : null;
  const decimals = config.currencies.find((currency) => currency.code === session.currency)?.decimals ?? 2;

  return (
    <Card>
      <CardBody className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-small font-semibold text-ink-muted">{t.resume.yourOrder}</p>
            <h2 className="mt-1 text-heading text-ink">{session.service.name}</h2>
            <p className="mt-1 text-small text-ink-subtle">
              <Badge tone="outline" shape="tag">
                {c.serviceType[session.service.type]}
              </Badge>
            </p>
          </div>
          <Badge tone="warning">{t.resume.unfinished}</Badge>
        </div>
        <p className="text-body text-ink-muted">
          {slot(
            t.resume.priceThen,
            "amount",
            <Money amount={session.amounts.display.gross} currency={session.currency} locale={locale} decimals={decimals} className="font-semibold text-ink" />,
          )}
        </p>
        {href ? (
          <>
            <ButtonLink href={href} block>
              {t.resume.newCheckout}
            </ButtonLink>
            <p className="text-small text-ink-subtle">{t.resume.note}</p>
          </>
        ) : (
          <EmptyState
            compact
            icon={<PackageSearch aria-hidden="true" />}
            title={t.resume.goneTitle}
            description={t.resume.goneText}
            action={<ButtonLink href={p("/services")}>{t.resume.browse}</ButtonLink>}
          />
        )}
      </CardBody>
    </Card>
  );
}
