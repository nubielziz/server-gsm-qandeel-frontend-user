// Settings frame (mockup "Account settings"): the sub-navigation on the start side, the page in the centre, and an
// end-side column with the account summary, security shortcuts and a help card. One frame for every rank; the list of
// sections follows the rank (lib/account/settings-nav.ts). The page title is the only h1. The title is static; the
// navigation and the summary read the session, so they stream inside <Suspense>.
import { Suspense } from "react";
import { capabilitiesOf } from "@/lib/account/capabilities";
import { SETTINGS_PATHS } from "@/lib/account/settings-nav";
import { requireAccount } from "@/lib/api/session";
import { account } from "@/lib/i18n/messages/account";
import { sitePath } from "@/lib/site-path";
import { AccountSummary, AsideSkeleton, HelpCard, SecurityShortcuts } from "@/components/merchant-settings/account-aside";
import { NavSkeleton } from "@/components/merchant-settings/skeletons";
import { SettingsNav } from "@/components/merchant-settings/settings-nav";
import { PageHeader } from "@/components/layout/container";

/** The navigation of the signed-in account: only the sections its rank has. */
async function Navigation() {
  const me = await requireAccount(sitePath(SETTINGS_PATHS.profile));
  const t = account.settings;
  return (
    <SettingsNav
      caps={capabilitiesOf(me)}
      labels={{
        navLabel: t.navLabel,
        navTitle: t.navTitle,
        sections: {
          profile: t.nav.profile,
          security: t.nav.security,
          notifications: t.nav.notifications,
          "api-keys": t.nav.apiKeys,
          privacy: t.nav.privacy,
        },
      }}
    />
  );
}

export default function SettingsLayout({ children }: LayoutProps<"/en/account/settings">) {
  const t = account.settings;
  return (
    <div className="grid gap-4">
      <PageHeader variant="card" title={t.title} description={t.description} />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_21rem]">
        <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-4 xl:row-span-1">
          <Suspense fallback={<NavSkeleton />}>
            <Navigation />
          </Suspense>
        </div>
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">{children}</div>
        <aside className="grid min-w-0 gap-4 md:grid-cols-2 lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-start-1 xl:grid-cols-1">
          <Suspense fallback={<AsideSkeleton />}>
            <AccountSummary />
            <SecurityShortcuts />
          </Suspense>
          <div className="md:col-span-2 xl:col-span-1">
            <HelpCard />
          </div>
        </aside>
      </div>
    </div>
  );
}
