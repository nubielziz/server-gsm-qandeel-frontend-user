// Add funds (handoff §4.8). The payment methods are personal (limits follow the merchant's group), so they stream.
import { Suspense } from "react";
import { Landmark } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/container";
import { PageError } from "@/components/merchant/page-error";
import { TopUpForm } from "@/components/merchant/top-up-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { apiSessionGet } from "@/lib/api/server";
import type { PaymentMethod } from "@/lib/api/types";
import { sitePath } from "@/lib/site-path";
import { common } from "@/lib/i18n/messages/common";
import { merchant } from "@/lib/i18n/messages/merchant";
import { settle } from "@/lib/merchant/load";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  const t = merchant;
  return { title: t.topUp.title };
}

export default function TopUpPage() {
  const t = merchant;
  const c = common;
  return (
    <PageTransition>
      <div className="grid gap-6">
        <Breadcrumbs
          label={c.workspace.breadcrumbLabel}
          items={[{ label: t.wallet.title, href: sitePath("/merchant/wallet") }, { label: t.topUp.title }]}
        />
        <PageHeader title={t.topUp.title} description={t.topUp.description} />
        <Suspense
          fallback={
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start" aria-hidden="true">
              <Skeleton className="h-80 rounded-card" />
              <Skeleton className="h-72 rounded-card" />
            </div>
          }
        >
          <Methods />
        </Suspense>
      </div>
    </PageTransition>
  );
}

async function Methods() {
  const t = merchant;
  const here = sitePath("/merchant/wallet/top-up");
  const result = await settle(apiSessionGet<PaymentMethod[]>("/client/payment-methods"));
  if (!result.ok) return <PageError error={result.error} next={here} />;
  if (result.data.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Landmark aria-hidden="true" />}
          title={t.topUp.emptyTitle}
          description={t.topUp.emptyText}
          action={<ButtonLink href={sitePath("/help")}>{t.topUp.emptyAction}</ButtonLink>}
        />
      </Card>
    );
  }
  return <TopUpForm methods={result.data} invoiceBase={sitePath("/merchant/invoices")} labels={t.topUp} />;
}
