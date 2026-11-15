// Review and pay for one checkout session. The session is read on the server with the visitor's IP forwarded (the token
// routes are limited to 30 requests a minute per IP), behind <Suspense>; the interactive part is a Client Component.
// For the store balance (plan F30, D9) the server also reads who is signed in and their wallet, in this request and never
// cached, and hands the view only the facts it needs (`balanceOption` decides what shows).
import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { PackageSearch } from "lucide-react";
import { Container, PageHeader } from "@/components/layout/container";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { BalanceWallet } from "@/components/checkout/balance-option";
import { SessionView } from "@/components/checkout/session-view";
import { isApiError } from "@/lib/api/errors";
import { BusyState } from "@/components/ui/busy-state";
import { getStoreConfig } from "@/lib/api/public";
import { apiSessionGet } from "@/lib/api/server";
import { getCustomer } from "@/lib/api/session";
import type { CheckoutSession, CustomerWallet } from "@/lib/api/types";
import { slugForService } from "@/lib/catalog";
import { countryName } from "@/lib/countries";
import { localePath } from "@/lib/i18n/config";
import { checkout } from "@/lib/i18n/messages/checkout";
import { common } from "@/lib/i18n/messages/common";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { walletCapabilities } from "@/lib/wallet/view";

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

  const [config, slug, balance] = await Promise.all([
    getStoreConfig(),
    slugForService(session.service.id, locale),
    readBalanceContext(session),
  ]);
  const decimals = config.currencies.find((currency) => currency.code === session.currency)?.decimals ?? 2;
  return (
    <SessionView
      session={session}
      locale={locale}
      labels={t.session}
      quantityLabels={c.quantity}
      typeLabel={c.serviceType[session.service.type]}
      decimals={decimals}
      // A restart keeps the quantity: the form checks it against today's rule.
      restartHref={slug ? `${localePath(locale, "/checkout")}?service=${encodeURIComponent(slug)}&quantity=${session.quantity}` : null}
      countryName={session.country ? countryName(session.country, locale) : ""}
      balance={balance}
    />
  );
}

/**
 * Who is signed in and their wallet, for the "Store balance" choice. Only an open checkout needs it. A visitor without a
 * customer session costs no request (`getCustomer` looks at the CSRF cookie first). Any failure leaves the balance out:
 * the card gateways must keep working when the wallet cannot be read.
 */
async function readBalanceContext(session: CheckoutSession): Promise<{ signedIn: boolean; wallet: BalanceWallet | null }> {
  if (session.status !== "open") return { signedIn: false, wallet: null };
  let customer;
  try {
    customer = await getCustomer();
  } catch {
    // `getCustomer` already answers null for a signed-out visitor and throws only on other failures (5xx, 429): do not
    // say "sign in" to someone who may be signed in. Leave the balance out; the gateways keep working.
    return { signedIn: true, wallet: null };
  }
  if (!customer) return { signedIn: false, wallet: null };
  try {
    const wallet = await apiSessionGet<CustomerWallet>("/store/v1/me/wallet");
    return { signedIn: true, wallet: { enabled: wallet.enabled === true, available: wallet.available, frozen: walletCapabilities(wallet).frozen } };
  } catch {
    return { signedIn: true, wallet: null };
  }
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
