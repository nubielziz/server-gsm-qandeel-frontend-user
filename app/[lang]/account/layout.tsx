// Customer area frame (same pattern as the merchant portal): dark icon rail, header card, avatar menu. The frame depends
// on who is signed in, so it streams behind <Suspense> (the static shell is the same-size skeleton). Signed out → sign-in
// (customer tab). No wallet: customers have none yet (ROADMAP 2W). Support lives in the shop chrome (`/support`).
import { Suspense, type ReactNode } from "react";
import { Bell, ClipboardList, Headset, LayoutDashboard, Settings, Store, UserRound } from "lucide-react";
import { requireCustomer } from "@/lib/api/session";
import { localePath } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { common } from "@/lib/i18n/messages/common";
import { portal } from "@/lib/i18n/messages/portal";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { BellSkeleton, BellSlot } from "@/components/notifications/bell-slot";
import { WorkspaceShell, WorkspaceShellSkeleton, type WorkspaceNavItem } from "@/components/layout/workspace-shell";
import { MenuItem, MenuSeparator } from "@/components/ui/menu";

async function CustomerFrame({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const [me, t, c] = await Promise.all([requireCustomer(locale), getMessages(portal), getMessages(common)]);
  const p = (path: string) => localePath(locale, path);
  const icon = "size-5";

  const nav: WorkspaceNavItem[] = [
    { href: p("/account"), label: t.customerNav.overview, icon: <LayoutDashboard aria-hidden="true" className={icon} />, match: "exact" },
    { href: p("/account/orders"), label: t.customerNav.orders, icon: <ClipboardList aria-hidden="true" className={icon} /> },
    { href: p("/account/notifications"), label: t.customerNav.notifications, icon: <Bell aria-hidden="true" className={icon} /> },
    { href: p("/support"), label: t.customerNav.support, icon: <Headset aria-hidden="true" className={icon} /> },
  ];
  const footerNav: WorkspaceNavItem[] = [
    { href: p("/account/settings"), label: t.customerNav.settings, icon: <Settings aria-hidden="true" className={icon} /> },
  ];

  return (
    <WorkspaceShell
      nav={nav}
      footerNav={footerNav}
      areaLabel={t.customerArea}
      homeHref={p("/account")}
      user={{ name: me.name || me.email, subtitle: t.customerRole }}
      userMenu={
        <>
          <MenuItem href={p("/account")} icon={<UserRound aria-hidden="true" />}>
            {c.header.myAccount}
          </MenuItem>
          <MenuItem href={p("/account/settings")} icon={<Settings aria-hidden="true" />}>
            {t.customerNav.settings}
          </MenuItem>
          <MenuItem href={p("/")} icon={<Store aria-hidden="true" />}>
            {t.customerNav.shop}
          </MenuItem>
          <MenuSeparator />
          <SignOutButton surface="customer" label={c.header.signOut} pendingLabel={c.header.signingOut} />
        </>
      }
      headerSlot={
        <Suspense fallback={<BellSkeleton />}>
          <BellSlot surface="customer" />
        </Suspense>
      }
      search={{ action: p("/services"), label: t.searchServices, placeholder: t.searchServices, submitLabel: c.actions.search }}
    >
      {children}
    </WorkspaceShell>
  );
}

// No ChromeProviders here: WorkspaceShell mounts it itself, and a second one would render a second <Toaster/> (every
// toast would show twice).
export default function AccountLayout({ children }: LayoutProps<"/[lang]/account">) {
  return (
    <Suspense fallback={<WorkspaceShellSkeleton />}>
      <CustomerFrame>{children}</CustomerFrame>
    </Suspense>
  );
}
