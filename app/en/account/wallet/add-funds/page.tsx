// Add funds (plan F33, BH §3.3): the customer picks a payment method and an amount (`TopUpForm`). The frame is static; the
// wallet limits and the methods are personal and never cached, so they are read at request time (no-store, behind
// <Suspense> with a skeleton). The wallet is the request's one shared read (`readCustomerWallet`), also used by the layout.
// - Switched off (`enabled: false`) or no method (the API answers `[]` while the balance is off): an explanation and a way back.
// - A balance on hold: online methods are not offered (a bank transfer still works, BH §3.3).
// - No top-up left today, or no room left in the wallet: a notice says why; the form still checks and explains.
// A failed read shows the request reference; a signed-out answer goes to the customer sign-in page, which comes back here.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Landmark, Wallet } from "lucide-react";
import { apiSessionGet } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import type { TopUpMethod } from "@/lib/api/types";
import { sitePath } from "@/lib/site-path";
import { errorText } from "@/lib/i18n/error-text-core";
import { common } from "@/lib/i18n/messages/common";
import { errors } from "@/lib/i18n/messages/errors";
import { topUps } from "@/lib/i18n/messages/top-ups";
import { wallet } from "@/lib/i18n/messages/wallet";
import { settle } from "@/lib/merchant/load";
import { isNoLimit } from "@/lib/wallet/top-up-errors";
import { walletCapabilities } from "@/lib/wallet/view";
import { readCustomerWallet } from "@/components/layout/account-area";
import { PageHeader } from "@/components/layout/container";
import { RetryButton } from "@/components/merchant/retry-button";
import { TopUpForm } from "@/components/wallet/top-up-form";
import { Alert } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  const t = topUps;
  return { title: t.metaTitle, robots: { index: false, follow: false } };
}

const SIGNED_OUT_CODES = new Set(["UNAUTHORIZED", "ACCOUNT_SUSPENDED", "IP_NOT_ALLOWED"]);

/** A signed-out answer (handoff §3.4) goes to the customer sign-in page, which comes back here; anything else returns. */
function leaveIfSignedOut(error: unknown, next: string): void {
  if (isApiError(error) && (error.status === 401 || SIGNED_OUT_CODES.has(error.code))) {
    redirect(`${sitePath("/sign-in")}?${new URLSearchParams({ as: "customer", next }).toString()}`);
  }
}

function AddFundsSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="grid gap-6">
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="h-48 rounded-card" />
      </div>
      <Skeleton className="h-72 rounded-card" />
    </div>
  );
}

async function AddFundsContent() {
  const t = topUps;
  const here = sitePath("/account/wallet/add-funds");
  const walletHref = sitePath("/account/wallet");

  const [read, methodsRead] = await Promise.all([
    readCustomerWallet(),
    settle(apiSessionGet<TopUpMethod[]>("/store/v1/me/wallet/top-up-methods")),
  ]);

  const failure = (error: unknown) => {
    const text = errorText(errors);
    return (
      <Card>
        <ErrorState title={t.add.loadTitle} message={text.message(error)} reference={text.reference(error)} action={<RetryButton label={t.add.retry} />} />
      </Card>
    );
  };

  if (!read.ok) {
    leaveIfSignedOut(read.error, here);
    return failure(read.error);
  }
  const state = read.data;
  const caps = walletCapabilities(state);
  const back = (
    <ButtonLink href={walletHref} variant="secondary">
      {t.backToWallet}
    </ButtonLink>
  );

  // Switched off: nothing can be added (the methods list is empty too). A balance already there is kept.
  if (!caps.canAddFunds) {
    return (
      <Card>
        <EmptyState icon={<Wallet aria-hidden="true" />} title={t.add.disabledTitle} description={t.add.disabledText} action={back} />
      </Card>
    );
  }

  if (!methodsRead.ok) {
    leaveIfSignedOut(methodsRead.error, here);
    return failure(methodsRead.error);
  }
  const methods = methodsRead.data;
  if (methods.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Landmark aria-hidden="true" />}
          title={t.add.noMethodsTitle}
          description={t.add.noMethodsText}
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <ButtonLink href={sitePath("/support")}>{t.add.contact}</ButtonLink>
              {back}
            </div>
          }
        />
      </Card>
    );
  }

  const limits = state.limits;
  return (
    <div className="grid gap-6">
      {caps.frozen ? (
        <Alert tone="warning" title={t.add.frozenTitle}>
          {t.add.frozenText}
        </Alert>
      ) : null}
      {limits.topUpsLeftToday <= 0 ? (
        <Alert tone="warning" title={t.add.noTopUpsTitle}>
          {t.add.noTopUpsText}
        </Alert>
      ) : isNoLimit(limits.room) ? (
        <Alert tone="warning" title={t.add.noRoomTitle}>
          {t.add.noRoomText}
        </Alert>
      ) : null}
      <TopUpForm
        methods={methods}
        limits={limits}
        frozen={caps.frozen}
        detailBase={sitePath("/account/wallet/top-ups")}
        labels={t.form}
        errors={t.errors}
      />
    </div>
  );
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
          <AddFundsContent />
        </Suspense>
      </div>
    </PageTransition>
  );
}
