// Merchant dashboard (handoff §4.3, mockup "Workspace"). Everything is personal, so it streams behind <Suspense>.
// A merchant waiting for approval sees a "while you wait" area instead (the layout already shows the banner).
import { Suspense } from "react";
import { FileCheck2, Plus, ShieldCheck, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/container";
import { BalanceCard, HelpCard, OrderStats, QuickOrder, RecentOrders, RecentlyOrdered, StatusSummary } from "@/components/merchant/dashboard-widgets";
import { PageError } from "@/components/merchant/page-error";
import { DashboardSkeleton } from "@/components/merchant/skeletons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { apiSessionGet } from "@/lib/api/server";
import { requireMerchant } from "@/lib/api/session";
import type { MerchantDashboard } from "@/lib/api/types";
import { sitePath } from "@/lib/site-path";
import { fmt } from "@/lib/i18n/define";
import { common } from "@/lib/i18n/messages/common";
import { merchant } from "@/lib/i18n/messages/merchant";
import { portal } from "@/lib/i18n/messages/portal";
import { settle } from "@/lib/merchant/load";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  const t = merchant;
  return { title: t.dashboard.title };
}

export default function MerchantDashboardPage() {
  return (
    <PageTransition>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </PageTransition>
  );
}

async function Dashboard() {
  // The dashboard read (`result`) starts with the session read (plan P1.3): one API round trip instead of two. A pending
  // merchant never uses it (the API answers 403, settled here and ignored below) and a signed-out visitor is redirected
  // before it matters. No-store and per request, as every personal read.
  const [me, result] = await Promise.all([
    requireMerchant(sitePath("/merchant")),
    settle(apiSessionGet<MerchantDashboard>("/client/dashboard")),
  ]);
  const t = merchant;
  const c = common;
  const p = portal;
  const name = me.name || me.email;
  const pending = me.status === "pending";

  const header = (
    <PageHeader
      variant="card"
      title={fmt(t.dashboard.welcome, { name })}
      description={pending ? undefined : t.dashboard.welcomeText}
      actions={
        pending ? undefined : (
          <ButtonLink href={sitePath("/merchant/services")} startIcon={<Plus aria-hidden="true" />}>
            {t.dashboard.newOrder}
          </ButtonLink>
        )
      }
    />
  );

  if (pending) {
    const cards = [
      { key: "profile", href: "/merchant/settings", icon: <UserRound aria-hidden="true" />, label: p.pending.profile, ...t.dashboard.pendingCards.profile },
      { key: "security", href: "/merchant/settings/security", icon: <ShieldCheck aria-hidden="true" />, label: p.pending.security, ...t.dashboard.pendingCards.security },
      { key: "verification", href: "/merchant/settings/verification", icon: <FileCheck2 aria-hidden="true" />, label: p.pending.verification, ...t.dashboard.pendingCards.verification },
    ];
    return (
      <div className="grid gap-6">
        {header}
        <section aria-labelledby="pending-steps" className="grid gap-4">
          <div>
            <h2 id="pending-steps" className="text-heading text-ink">
              {t.dashboard.pendingTitle}
            </h2>
            <p className="mt-1 text-body text-ink-muted">{t.dashboard.pendingText}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {cards.map((card) => (
              <Card key={card.key}>
                <CardBody className="flex h-full flex-col gap-4">
                  <span className="grid size-12 place-items-center rounded-card bg-surface-muted [&_svg]:size-6">{card.icon}</span>
                  <div className="grid gap-1">
                    <h3 className="text-subheading text-ink">{card.title}</h3>
                    <p className="text-body text-ink-muted">{card.text}</p>
                  </div>
                  <ButtonLink href={sitePath(card.href)} variant="secondary" className="mt-auto self-start">
                    {card.label}
                  </ButtonLink>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="grid gap-6">
        {header}
        <PageError error={result.error} next={sitePath("/merchant")} />
      </div>
    );
  }
  const props = { data: result.data, t, c };
  return (
    <div className="grid gap-4">
      {header}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <BalanceCard {...props} />
        </div>
        <div className="grid gap-4 xl:col-span-7">
          <OrderStats {...props} />
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <StatusSummary {...props} />
        </div>
        <div className="xl:col-span-5">
          <QuickOrder t={t} />
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <RecentOrders {...props} />
        </div>
        <div className="min-w-0 xl:col-span-4">
          <RecentlyOrdered {...props} />
        </div>
      </div>
      <HelpCard t={t} />
    </div>
  );
}
