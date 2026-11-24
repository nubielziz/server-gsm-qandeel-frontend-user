// The wallet (/account/wallet), one page for every account. The rank decides what is drawn: a retail rank sees its store balance
// (balance cards, notices, latest top-ups, dated statement), a merchant rank its wallet (four cards, the note about online payments,
// the statement and its CSV): components/account/wallet. The wallet is the request's one shared read (`readAccountWallet`), also
// used by the frame's nav item and pill; the page never asks the route of the other rank.
// The frame (heading) is static; the wallet, the top-ups and the statement are personal and never cached, so they are read at
// request time and stream behind <Suspense> with a skeleton. A signed-out answer goes to the sign-in page, which comes back here.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { readAccountWallet } from "@/lib/account/wallet-read";
import { signInPath } from "@/lib/api/session";
import { wallet } from "@/lib/i18n/messages/wallet";
import type { SearchParams } from "@/lib/merchant/lists";
import { settle } from "@/lib/merchant/load";
import { sitePath } from "@/lib/site-path";
import { MerchantWalletView } from "@/components/account/wallet/merchant-wallet";
import { RetailWalletView } from "@/components/account/wallet/retail-wallet";
import { WalletLoadError, WalletSkeleton } from "@/components/account/wallet/wallet-parts";
import { PageHeader } from "@/components/layout/container";
import { PageTransition } from "@/components/layout/page-transition";
import { Card } from "@/components/ui/card";

export function generateMetadata(): Metadata {
  const t = wallet;
  return { title: t.metaTitle, robots: { index: false, follow: false } };
}

async function WalletByRank({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = wallet;
  // Who is signed in is read first (a failure to tell is a failed page, shown with its reference); then one wallet route.
  const read = await settle(readAccountWallet());
  if (!read.ok) {
    return (
      <Card>
        <WalletLoadError error={read.error} title={t.errors.loadTitle} retry={t.errors.retry} />
      </Card>
    );
  }
  if (!read.data) redirect(signInPath(sitePath("/account/wallet")));
  return read.data.kind === "merchant" ? (
    <MerchantWalletView read={read.data.read} searchParams={searchParams} />
  ) : (
    <RetailWalletView read={read.data.read} searchParams={searchParams} />
  );
}

export default function WalletPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = wallet;
  return (
    <PageTransition>
      <div className="grid gap-4">
        <PageHeader variant="card" title={t.page.title} description={t.page.description} />
        <Suspense fallback={<WalletSkeleton />}>
          <WalletByRank searchParams={searchParams} />
        </Suspense>
      </div>
    </PageTransition>
  );
}
