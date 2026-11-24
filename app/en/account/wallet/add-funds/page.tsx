// Add funds (/account/wallet/add-funds), one page for every account. The rank decides the form: a retail rank picks a method and an
// amount and creates a keyed top-up; a merchant rank creates an invoice (a manual method goes on to the invoice page, an online one
// to the payment provider): components/account/wallet. The frame is static; the wallet limits and the methods are personal and never
// cached, so they are read at request time behind <Suspense> with a skeleton. The wallet is the request's one shared read
// (`readAccountWallet`), also used by the frame. A signed-out answer goes to the sign-in page, which comes back here.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { readAccountWallet } from "@/lib/account/wallet-read";
import { signInPath } from "@/lib/api/session";
import { common } from "@/lib/i18n/messages/common";
import { topUps } from "@/lib/i18n/messages/top-ups";
import { wallet } from "@/lib/i18n/messages/wallet";
import { settle } from "@/lib/merchant/load";
import { sitePath } from "@/lib/site-path";
import { MerchantAddFundsView } from "@/components/account/wallet/merchant-add-funds";
import { RetailAddFundsView } from "@/components/account/wallet/retail-add-funds";
import { AddFundsSkeleton, WalletLoadError } from "@/components/account/wallet/wallet-parts";
import { PageHeader } from "@/components/layout/container";
import { PageTransition } from "@/components/layout/page-transition";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";

export function generateMetadata(): Metadata {
  const t = topUps;
  return { title: t.metaTitle, robots: { index: false, follow: false } };
}

async function AddFundsByRank() {
  const t = topUps;
  const read = await settle(readAccountWallet());
  if (!read.ok) {
    return (
      <Card>
        <WalletLoadError error={read.error} title={t.add.loadTitle} retry={t.add.retry} />
      </Card>
    );
  }
  if (!read.data) redirect(signInPath(sitePath("/account/wallet/add-funds")));
  return read.data.kind === "merchant" ? <MerchantAddFundsView /> : <RetailAddFundsView read={read.data.read} />;
}

export default function AddFundsPage() {
  const t = topUps;
  const w = wallet;
  const c = common;
  return (
    <PageTransition>
      <div className="grid gap-4">
        <PageHeader
          variant="card"
          eyebrow={
            <Breadcrumbs
              label={c.workspace.breadcrumbLabel}
              items={[{ label: w.page.title, href: sitePath("/account/wallet") }, { label: t.add.title }]}
            />
          }
          title={t.add.title}
          description={t.add.description}
        />
        <Suspense fallback={<AddFundsSkeleton />}>
          <AddFundsByRank />
        </Suspense>
      </div>
    </PageTransition>
  );
}
