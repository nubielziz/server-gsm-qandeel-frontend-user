// One top-up (plan F33, BH §3.3): its facts, what the status means and what the customer can do now: read the transfer
// instructions, upload the receipt, cancel (a manual top-up), or continue to the payment page (an online one). The frame
// is static; the top-up is personal and never cached, so it is read at request time behind <Suspense> with a skeleton.
// A top-up that is not the customer's answers 404; a signed-out answer goes to the customer sign-in page, which comes back here.
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { apiSessionGet } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import type { TopUpDetail } from "@/lib/api/types";
import { sitePath } from "@/lib/site-path";
import { errorText } from "@/lib/i18n/error-text-core";
import { common, statusLabel } from "@/lib/i18n/messages/common";
import { errors } from "@/lib/i18n/messages/errors";
import { topUps } from "@/lib/i18n/messages/top-ups";
import { wallet } from "@/lib/i18n/messages/wallet";
import { settle } from "@/lib/merchant/load";
import { PageHeader } from "@/components/layout/container";
import { RetryButton } from "@/components/merchant/retry-button";
import { TopUpDetailView } from "@/components/wallet/top-up-detail";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  const t = topUps;
  return { title: t.detailMetaTitle, robots: { index: false, follow: false } };
}

const SIGNED_OUT_CODES = new Set(["UNAUTHORIZED", "ACCOUNT_SUSPENDED", "IP_NOT_ALLOWED"]);

/** A signed-out answer (handoff §3.4) goes to the customer sign-in page, which comes back here; anything else returns. */
function leaveIfSignedOut(error: unknown, next: string): void {
  if (isApiError(error) && (error.status === 401 || SIGNED_OUT_CODES.has(error.code))) {
    redirect(`${sitePath("/sign-in")}?${new URLSearchParams({ as: "customer", next }).toString()}`);
  }
}

function TopUpSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-4">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-[5.5rem] rounded-card" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <Skeleton className="h-96 rounded-card" />
        <Skeleton className="h-72 rounded-card" />
      </div>
    </div>
  );
}

async function TopUpView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = topUps;
  const w = wallet;
  const c = common;
  // The id is a number in the API; anything else cannot be one of the customer's top-ups.
  if (!/^[1-9]\d{0,15}$/.test(id)) notFound();
  const here = sitePath(`/account/wallet/top-ups/${id}`);
  const result = await settle(apiSessionGet<TopUpDetail>(`/store/v1/me/wallet/top-ups/${id}`));

  if (!result.ok) {
    leaveIfSignedOut(result.error, here);
    if (isApiError(result.error) && result.error.status === 404) notFound();
    const text = errorText(errors);
    return (
      <div className="grid gap-4">
        <PageHeader variant="card" title={t.detailMetaTitle} />
        <Card>
          <ErrorState
            title={t.detail.loadTitle}
            message={text.message(result.error)}
            reference={text.reference(result.error)}
            action={<RetryButton label={t.detail.retry} />}
          />
        </Card>
      </div>
    );
  }

  const topUp = result.data;
  // "Top-up INV-2026-0042": the number stays left-to-right inside the title, without an invisible mark in the name.
  const [before, after] = t.detail.title.split("{number}");
  return (
    <div className="grid gap-4">
      <PageHeader
        variant="card"
        eyebrow={
          <Breadcrumbs
            label={c.workspace.breadcrumbLabel}
            items={[{ label: w.page.title, href: sitePath("/account/wallet") }, { label: topUp.number }]}
          />
        }
        title={
          <>
            {before}
            <bdi dir="ltr">{topUp.number}</bdi>
            {after}
          </>
        }
        description={<span dir="auto">{topUp.method.name}</span>}
        actions={<StatusBadge kind="topUp" status={topUp.status} label={statusLabel(c, "topUp", topUp.status)} />}
      />
      <TopUpDetailView
        topUp={topUp}
        labels={t.detail}
        actions={t.actions}
        errors={t.errors}
        statusLabel={statusLabel(c, "topUp", topUp.status)}
        hrefs={{ wallet: sitePath("/account/wallet"), addFunds: sitePath("/account/wallet/add-funds") }}
      />
    </div>
  );
}

export default function TopUpPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageTransition>
      <Suspense fallback={<TopUpSkeleton />}>
        <TopUpView params={params} />
      </Suspense>
    </PageTransition>
  );
}
