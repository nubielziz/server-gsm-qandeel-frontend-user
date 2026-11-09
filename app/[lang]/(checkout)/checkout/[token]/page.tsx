// Review and pay for one checkout session. The session is read on the server with the visitor's IP forwarded (the token
// routes are limited to 30 requests a minute per IP), behind <Suspense>; the interactive part is a Client Component.
import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { PackageSearch } from "lucide-react";
import { Container, PageHeader } from "@/components/layout/container";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SessionView } from "@/components/checkout/session-view";
import { isApiError } from "@/lib/api/errors";
import { BusyState } from "@/components/ui/busy-state";
import { getStoreConfig } from "@/lib/api/public";
import { apiSessionGet } from "@/lib/api/server";
import type { CheckoutSession } from "@/lib/api/types";
import { slugForService } from "@/lib/catalog";
import { countryName } from "@/lib/countries";
import { localePath } from "@/lib/i18n/config";
import { checkout } from "@/lib/i18n/messages/checkout";
import { common } from "@/lib/i18n/messages/common";
import { getLocale, getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(checkout);
  return { title: t.meta.session, robots: { index: false, follow: false } };
}

export default async function CheckoutSessionPage(props: PageProps<"/[lang]/checkout/[token]">) {
  const t = await getMessages(checkout);
  return (
    <Container width="wide" className="py-8 lg:py-10">
      <PageHeader title={t.session.title} description={t.session.description} />
      <div className="mt-6">
        <Suspense fallback={<SessionSkeleton />}>
          <Session params={props.params} />
        </Suspense>
      </div>
    </Container>
  );
}

async function Session({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, locale, t, c] = await Promise.all([params, getLocale(), getMessages(checkout), getMessages(common)]);
  // A per-visitor read of a token route: request time by nature (also keeps Next's prerender check from tripping on the fetch).
  await connection();
  let session: CheckoutSession;
  try {
    session = await apiSessionGet<CheckoutSession>(`/store/v1/checkout-sessions/${encodeURIComponent(token)}`);
  } catch (error) {
    if (isApiError(error) && error.status === 429) {
      return <BusyState error={error} retryHref={localePath(locale, `/checkout/${encodeURIComponent(token)}`)} />;
    }
    if (isApiError(error) && (error.status === 404 || error.status === 422)) {
      return (
        <Card>
          <EmptyState
            icon={<PackageSearch aria-hidden="true" />}
            title={t.session.notFoundTitle}
            description={t.session.notFoundText}
            action={<ButtonLink href={localePath(locale, "/services")}>{t.session.notFoundAction}</ButtonLink>}
          />
        </Card>
      );
    }
    throw error;
  }

  const [config, slug] = await Promise.all([getStoreConfig(), slugForService(session.service.id, locale)]);
  const decimals = config.currencies.find((currency) => currency.code === session.currency)?.decimals ?? 2;
  return (
    <SessionView
      session={session}
      locale={locale}
      labels={t.session}
      typeLabel={c.serviceType[session.service.type]}
      decimals={decimals}
      restartHref={slug ? `${localePath(locale, "/checkout")}?service=${encodeURIComponent(slug)}` : null}
      countryName={session.country ? countryName(session.country, locale) : ""}
    />
  );
}

/** Same layout as the loaded page: order, consents and methods on the left, the summary on the right. */
function SessionSkeleton() {
  return (
    <div aria-busy="true" aria-hidden="true" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="grid gap-6">
        <Skeleton className="h-[22rem] rounded-card" />
        <Skeleton className="h-[20rem] rounded-card" />
        <Skeleton className="h-[15rem] rounded-card" />
      </div>
      <Skeleton className="h-[26rem] rounded-card" />
    </div>
  );
}
