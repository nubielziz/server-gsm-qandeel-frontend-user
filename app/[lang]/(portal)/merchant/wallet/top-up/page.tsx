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
import { localePath } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { common } from "@/lib/i18n/messages/common";
import { merchant } from "@/lib/i18n/messages/merchant";
import { settle } from "@/lib/merchant/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(merchant);
  return { title: t.topUp.title };
}

export default async function TopUpPage() {
  const [locale, t, c] = await Promise.all([getLocale(), getMessages(merchant), getMessages(common)]);
  return (
    <div className="grid gap-6">
      <Breadcrumbs
        label={c.workspace.breadcrumbLabel}
        items={[{ label: t.wallet.title, href: localePath(locale, "/merchant/wallet") }, { label: t.topUp.title }]}
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
  );
}

async function Methods() {
  const [locale, t] = await Promise.all([getLocale(), getMessages(merchant)]);
  const here = localePath(locale, "/merchant/wallet/top-up");
  const result = await settle(apiSessionGet<PaymentMethod[]>("/client/payment-methods"));
  if (!result.ok) return <PageError error={result.error} next={here} />;
  if (result.data.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Landmark aria-hidden="true" />}
          title={t.topUp.emptyTitle}
          description={t.topUp.emptyText}
          action={<ButtonLink href={localePath(locale, "/help")}>{t.topUp.emptyAction}</ButtonLink>}
        />
      </Card>
    );
  }
  return <TopUpForm methods={result.data} locale={locale} invoiceBase={localePath(locale, "/merchant/invoices")} labels={t.topUp} />;
}
