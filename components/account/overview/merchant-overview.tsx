// The overview of a merchant rank: the wallet card, the order counts, the latest orders and a help card, all from the one
// `GET /client/dashboard` answer. The page streams this component behind <Suspense> with a same-size skeleton. Server
// component.
import { Plus } from "lucide-react";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { apiSessionGet } from "@/lib/api/server";
import type { AccountMe, MerchantDashboard } from "@/lib/api/types";
import { sitePath } from "@/lib/site-path";
import { common } from "@/lib/i18n/messages/common";
import { merchant } from "@/lib/i18n/messages/merchant";
import { settle } from "@/lib/merchant/load";
import { BalanceCard, HelpCard, OrderStats, RecentOrders } from "@/components/merchant/dashboard-widgets";
import { PageError } from "@/components/merchant/page-error";
import { ButtonLink } from "@/components/ui/button";
import { OverviewHeader } from "./overview-header";

export async function MerchantOverview({ me }: { me: AccountMe }) {
  // No-store and per request, as every personal read. A rank refusal (403) or a signed-out answer is routed by PageError.
  const result = await settle(apiSessionGet<MerchantDashboard>(FAMILY_ROUTES.client.dashboard));
  const t = merchant;
  const header = (
    <OverviewHeader
      me={me}
      description={t.dashboard.welcomeText}
      actions={
        // A new order starts in the shop, where a merchant rank sees its own prices (decision 003).
        <ButtonLink href={sitePath("/services")} startIcon={<Plus aria-hidden="true" />}>
          {t.dashboard.newOrder}
        </ButtonLink>
      }
    />
  );

  if (!result.ok) {
    return (
      <div className="grid gap-6">
        {header}
        <PageError error={result.error} next={sitePath("/account")} />
      </div>
    );
  }
  const props = { data: result.data, t, c: common };
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
      <div className="min-w-0">
        <RecentOrders {...props} />
      </div>
      <HelpCard t={t} />
    </div>
  );
}
