// Account overview, for every account: the greeting with the rank, then the body of its kind (components/account/overview). The
// session and the reads happen at request time, so the content streams behind <Suspense> with a same-size skeleton.
import type { Metadata } from "next";
import { Suspense } from "react";
import { account } from "@/lib/i18n/messages/account";
import { AccountOverview } from "@/components/account/overview/account-overview";
import { OverviewSkeleton } from "@/components/account/overview/overview-skeleton";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  const t = account;
  return { title: t.overview.metaTitle, robots: { index: false, follow: false } };
}

export default function AccountOverviewPage() {
  return (
    <PageTransition>
      <Suspense fallback={<OverviewSkeleton />}>
        <AccountOverview />
      </Suspense>
    </PageTransition>
  );
}
