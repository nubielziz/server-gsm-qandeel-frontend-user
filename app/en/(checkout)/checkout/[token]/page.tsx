// Review and pay for one checkout session. The session is read on the server with the visitor's IP forwarded (the token
// routes are limited to 30 requests a minute per IP), behind <Suspense>; the interactive part is a Client Component.
// For the store balance (plan F30, D9) the server also reads who is signed in and their wallet, in this request and never
// cached, and hands the view only the facts it needs (`balanceOption` decides what shows). An account of a merchant rank
// has no store balance: its wallet is not read, and the view offers the payment methods only (`balanceContextFor`). The same
// read tells the view that the account orders from its price list, so the view shows that notice first (`sessionPriceList`).
import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { PackageSearch } from "lucide-react";
import { Container, PageHeader } from "@/components/layout/container";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { BalanceContext } from "@/components/checkout/balance-option";
import { SessionView } from "@/components/checkout/session-view";
import { isApiError } from "@/lib/api/errors";
import { BusyState } from "@/components/ui/busy-state";
import { getStoreConfig } from "@/lib/api/public";
import { apiSessionGet } from "@/lib/api/server";
import { getAccount } from "@/lib/api/session";
import type { AccountMe, CheckoutSession } from "@/lib/api/types";
import { sessionPriceList } from "@/lib/checkout/access";
import { balanceContextFor } from "@/lib/checkout/balance-context";
import { familyOf } from "@/lib/account/family";
import { readAccountWallet, type AccountWalletRead } from "@/lib/account/wallet-read";
import { slugForService } from "@/lib/catalog";
import { countryName } from "@/lib/countries";
import { checkout } from "@/lib/i18n/messages/checkout";
import { common } from "@/lib/i18n/messages/common";
import { sitePath } from "@/lib/site-path";

export function generateMetadata(): Metadata {
  const t = checkout;
  return { title: t.meta.session, robots: { index: false, follow: false } };
}

export default function CheckoutSessionPage(props: PageProps<"/en/checkout/[token]">) {
  const t = checkout;
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
  const { token } = await params;
  const t = checkout;
  const c = common;
  // A per-visitor read of a token route: request time by nature (also keeps Next's prerender check from tripping on the fetch).
  await connection();
  let session: CheckoutSession;
  try {
    session = await apiSessionGet<CheckoutSession>(`/store/v1/checkout-sessions/${encodeURIComponent(token)}`);
  } catch (error) {
    if (isApiError(error) && error.status === 429) {
      return <BusyState error={error} retryHref={sitePath(`/checkout/${encodeURIComponent(token)}`)} />;
    }
    if (isApiError(error) && (error.status === 404 || error.status === 422)) {
      return (
        <Card>
          <EmptyState
            icon={<PackageSearch aria-hidden="true" />}
            title={t.session.notFoundTitle}
            description={t.session.notFoundText}
            action={<ButtonLink href={sitePath("/services")}>{t.session.notFoundAction}</ButtonLink>}
          />
        </Card>
      );
    }
    throw error;
  }

  const [config, slug, { me, balance }] = await Promise.all([
    getStoreConfig(),
    slugForService(session.service.id),
    readAccountContext(session),
  ]);
  const priceList = sessionPriceList(me, session.service.id, slug);
  const decimals = config.currencies.find((currency) => currency.code === session.currency)?.decimals ?? 2;
  return (
    <SessionView
      session={session}
      labels={t.session}
      quantityLabels={c.quantity}
      typeLabel={c.serviceType[session.service.type]}
      decimals={decimals}
      // A restart keeps the quantity: the form checks it against today's rule.
      restartHref={slug ? `${sitePath("/checkout")}?service=${encodeURIComponent(slug)}&quantity=${session.quantity}` : null}
      countryName={session.country ? countryName(session.country) : ""}
      balance={balance}
      priceList={priceList ? { labels: t.start.priceList, ...priceList } : null}
    />
  );
}

/**
 * Who is signed in and their store balance, for the "Store balance" choice and the price-list notice. Only an open checkout
 * needs it. A visitor without an account session costs no request (`getAccount` looks at the CSRF cookie first), and an account
 * of a merchant rank costs no wallet read: it has no store balance (`balanceContextFor`). Any failure leaves the balance out
 * (and the account unknown): the card gateways must keep working when the wallet cannot be read.
 */
async function readAccountContext(session: CheckoutSession): Promise<{ me: AccountMe | null; balance: BalanceContext }> {
  if (session.status !== "open") return { me: null, balance: { signedIn: false, wallet: null } };
  let me: AccountMe | null;
  try {
    me = await getAccount();
  } catch {
    // `getAccount` already answers null for a signed-out visitor and throws only on other failures (5xx, 429): do not
    // say "sign in" to someone who may be signed in. Leave the balance out; the gateways keep working.
    return { me: null, balance: { signedIn: true, wallet: null } };
  }
  let wallet: AccountWalletRead | null = null;
  if (me && familyOf(me) === "store") {
    try {
      wallet = await readAccountWallet();
    } catch {
      wallet = null;
    }
  }
  return { me, balance: balanceContextFor(me, wallet) };
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
