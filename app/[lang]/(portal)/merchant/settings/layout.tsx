// Settings frame (mockup "Account Settings"): the sub-navigation on the start side, the page in the centre, and an
// end-side column with the account summary, security shortcuts and a help card. The page title is the only h1.
// The nav and the title are static; the summary and shortcuts read the session, so they stream inside <Suspense>.
import { Suspense } from "react";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { AccountSummary, AsideSkeleton, HelpCard, SecurityShortcuts } from "@/components/merchant-settings/account-aside";
import { SettingsNav } from "@/components/merchant-settings/settings-nav";
import { PageHeader } from "@/components/layout/container";

export default async function SettingsLayout({ children }: LayoutProps<"/[lang]/merchant/settings">) {
  const [locale, t] = await Promise.all([getLocale(), getMessages(merchantSettings)]);
  return (
    <div className="grid gap-4">
      <PageHeader variant="card" title={t.layout.title} description={t.layout.description} />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_21rem]">
        <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-4 xl:row-span-1">
          <SettingsNav
            locale={locale}
            labels={{
              navLabel: t.layout.navLabel,
              navTitle: t.layout.navTitle,
              profile: t.layout.nav.profile,
              security: t.layout.nav.security,
              notifications: t.layout.nav.notifications,
              verification: t.layout.nav.verification,
            }}
          />
        </div>
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">{children}</div>
        <aside className="grid min-w-0 gap-4 md:grid-cols-2 lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-start-1 xl:grid-cols-1">
          <Suspense fallback={<AsideSkeleton />}>
            <AccountSummary locale={locale} />
            <SecurityShortcuts locale={locale} />
          </Suspense>
          <div className="md:col-span-2 xl:col-span-1">
            <HelpCard locale={locale} />
          </div>
        </aside>
      </div>
    </div>
  );
}
