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
import { localePath } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { common } from "@/lib/i18n/messages/common";
import { merchant } from "@/lib/i18n/messages/merchant";
import { portal } from "@/lib/i18n/messages/portal";
import { settle } from "@/lib/merchant/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(merchant);
  return { title: t.dashboard.title };
}

export default function MerchantDashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const locale = await getLocale();
  const [me, t, c, p] = await Promise.all([requireMerchant(locale, localePath(locale, "/merchant")), getMessages(merchant), getMessages(common), getMessages(portal)]);
  const name = me.name || me.email;
  const pending = me.status === "pending";

  const header = (
    <PageHeader
      variant="card"
      title={fmt(t.dashboard.welcome, { name })}
      description={pending ? undefined : t.dashboard.welcomeText}
      actions={
        pending ? undefined : (
          <ButtonLink href={localePath(locale, "/merchant/services")} startIcon={<Plus aria-hidden="true" />}>
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
                  <ButtonLink href={localePath(locale, card.href)} variant="secondary" className="mt-auto self-start">
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

  const result = await settle(apiSessionGet<MerchantDashboard>("/client/dashboard"));
  if (!result.ok) {
    return (
      <div className="grid gap-6">
        {header}
        <PageError error={result.error} next={localePath(locale, "/merchant")} />
      </div>
    );
  }
  const props = { data: result.data, locale, t, c };
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
          <QuickOrder locale={locale} t={t} />
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
      <HelpCard locale={locale} t={t} />
    </div>
  );
}
