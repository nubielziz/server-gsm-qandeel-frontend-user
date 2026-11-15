// Customer area frame (same pattern as the merchant portal): dark icon rail, header card, avatar menu. The frame depends
// on who is signed in, so it streams behind <Suspense> (the static shell is the same-size skeleton). Signed out → sign-in
// (customer tab). The wallet (plan F21, D7) shows as a nav item and a header pill when `walletCapabilities().show`: the
// shop switch is on, or the customer still has a balance. The pill steps aside on phones (below `sm`), like the merchant's,
// so the bell and the account menu fit at 360 px; the wallet is one tap away in the navigation. Support lives in the shop
// chrome (`/support`).
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { Bell, ClipboardList, Headset, LayoutDashboard, Settings, Store, UserRound, Wallet } from "lucide-react";
import { requireCustomer } from "@/lib/api/session";
import { formatMoney } from "@/lib/format";
import { localePath } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { common } from "@/lib/i18n/messages/common";
import { portal } from "@/lib/i18n/messages/portal";
import { readCustomerWallet } from "@/components/layout/account-area";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { BellSkeleton, BellSlot } from "@/components/notifications/bell-slot";
import { WorkspaceShell, WorkspaceShellSkeleton, type WorkspaceNavItem } from "@/components/layout/workspace-shell";
import { MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Money } from "@/components/ui/money";
import { walletCapabilities } from "@/lib/wallet/view";

async function CustomerFrame({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const [me, t, c, walletRead] = await Promise.all([
    requireCustomer(locale),
    getMessages(portal),
    getMessages(common),
    readCustomerWallet(),
  ]);
  // A wallet that cannot be read (or must not show) is no nav item and no pill: the frame never breaks on it.
  const wallet = walletRead.ok && walletCapabilities(walletRead.data).show ? walletRead.data : null;
  const p = (path: string) => localePath(locale, path);
  const icon = "size-5";

  const nav: WorkspaceNavItem[] = [
    { href: p("/account"), label: t.customerNav.overview, icon: <LayoutDashboard aria-hidden="true" className={icon} />, match: "exact" },
    { href: p("/account/orders"), label: t.customerNav.orders, icon: <ClipboardList aria-hidden="true" className={icon} /> },
    ...(wallet ? [{ href: p("/account/wallet"), label: t.customerNav.wallet, icon: <Wallet aria-hidden="true" className={icon} /> }] : []),
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
        <>
          <Suspense fallback={<BellSkeleton />}>
            <BellSlot surface="customer" />
          </Suspense>
          {wallet ? (
            <Link
              href={p("/account/wallet")}
              aria-label={`${c.header.storeBalance}: ${formatMoney(wallet.available, "USD", locale)}`}
              className="inline-flex h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-body font-bold transition-colors hover:bg-surface-muted max-sm:hidden"
            >
              <Wallet aria-hidden="true" className="size-[18px]" />
              <Money amount={wallet.available} currency="USD" locale={locale} />
            </Link>
          ) : null}
        </>
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
