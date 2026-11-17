// Customer area frame (same pattern as the merchant portal): dark icon rail, header card, avatar menu. The frame is part
// of the static shell (plan P1.4): the rail, the header with the section title, the menu button and drawer and the main
// area are prerendered with no personal data in them, and only what depends on who is signed in streams in small holes:
// the avatar and name, the wallet item and pill, the bell. The session gate (signed out → sign-in, customer tab) is a
// hole of its own, next to the page instead of above it, so the page's reads start with the gate's rather than after it.
// The wallet (plan F21, D7) shows as a nav item and a header pill when `walletCapabilities().show`: the shop switch is
// on, or the customer still has a balance. The static nav reserves the wallet item's place and the read of the wallet
// shows or drops it. The pill steps aside on phones (below `sm`), like the merchant's, so the bell and the account menu
// fit at 360 px; the wallet is one tap away in the navigation. "My tickets" (`/account/tickets`, feature 28) is the way into
// support for a signed-in customer; the public form stays in the shop chrome (`/support`).
// Live badges (owner, 2026-11-15; components/layout/workspace-badges.tsx): the unread notifications, a dot while support
// wrote something unseen, and the orders in progress, each its own uncached read in its own <Suspense>. Below `lg` a tab
// bar holds Overview, Orders, Wallet (when it shows), Notifications and My tickets; the drawer keeps the full list.
import { Suspense } from "react";
import Link from "next/link";
import { Bell, ClipboardList, Headset, LayoutDashboard, Settings, Store, UserRound, Wallet } from "lucide-react";
import { requireCustomer } from "@/lib/api/session";
import { formatMoney } from "@/lib/format";
import { sitePath } from "@/lib/site-path";
import { common } from "@/lib/i18n/messages/common";
import { portal } from "@/lib/i18n/messages/portal";
import { readCustomerWallet } from "@/components/layout/account-area";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { BellSkeleton, BellSlot } from "@/components/notifications/bell-slot";
import { NotificationsNavBadge, OrdersNavBadge, SupportNavBadge } from "@/components/layout/workspace-badges";
import { WorkspaceMainSkeleton, WorkspaceShell, type WorkspaceNavItem } from "@/components/layout/workspace-shell";
import { MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { walletCapabilities } from "@/lib/wallet/view";

/** Sends a signed-out visitor to sign-in. Renders nothing; the layout puts it in <Suspense> next to the page. */
async function CustomerGate() {
  await requireCustomer();
  return null;
}

/** The header's wallet pill: only for a customer whose wallet shows. */
async function WalletPill() {
  const walletRead = await readCustomerWallet();
  const c = common;
  if (!walletRead.ok || !walletCapabilities(walletRead.data).show) return null;
  const wallet = walletRead.data;
  return (
    <Link
      href={sitePath("/account/wallet")}
      aria-label={`${c.header.storeBalance}: ${formatMoney(wallet.available, "USD")}`}
      className="inline-flex h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-body font-bold transition-colors hover:bg-surface-muted max-sm:hidden"
    >
      <Wallet aria-hidden="true" className="size-[18px]" />
      <Money amount={wallet.available} currency="USD" />
    </Link>
  );
}

export default function AccountLayout({ children }: LayoutProps<"/en/account">) {
  const t = portal;
  const c = common;
  const p = (path: string) => sitePath(path);
  const icon = "size-5";

  const overview: WorkspaceNavItem = {
    href: p("/account"),
    label: t.customerNav.overview,
    shortLabel: t.tabs.overview,
    icon: <LayoutDashboard aria-hidden="true" className={icon} />,
    match: "exact",
  };
  const orders: WorkspaceNavItem = {
    href: p("/account/orders"),
    label: t.customerNav.orders,
    shortLabel: t.tabs.orders,
    icon: <ClipboardList aria-hidden="true" className={icon} />,
    badge: <OrdersNavBadge surface="customer" />,
  };
  const wallet: WorkspaceNavItem = {
    href: p("/account/wallet"),
    label: t.customerNav.wallet,
    shortLabel: t.tabs.wallet,
    icon: <Wallet aria-hidden="true" className={icon} />,
  };
  const notifications: WorkspaceNavItem = {
    href: p("/account/notifications"),
    label: t.customerNav.notifications,
    shortLabel: t.tabs.notifications,
    icon: <Bell aria-hidden="true" className={icon} />,
    badge: <NotificationsNavBadge surface="customer" />,
  };
  const tickets: WorkspaceNavItem = {
    href: p("/account/tickets"),
    label: t.customerNav.myTickets,
    shortLabel: t.tabs.tickets,
    icon: <Headset aria-hidden="true" className={icon} />,
    badge: <SupportNavBadge surface="customer" />,
  };
  const footerNav: WorkspaceNavItem[] = [
    { href: p("/account/settings"), label: t.customerNav.settings, icon: <Settings aria-hidden="true" className={icon} /> },
  ];

  // A wallet that cannot be read (or must not show) is no nav item and no pill: the frame never breaks on it.
  async function resolveNav() {
    const walletRead = await readCustomerWallet();
    const shows = walletRead.ok && walletCapabilities(walletRead.data).show;
    // The tab bar holds the same five (four without the wallet): the drawer keeps Settings.
    const nav = shows ? [overview, orders, wallet, notifications, tickets] : [overview, orders, notifications, tickets];
    return { nav, footerNav, tabs: nav };
  }

  async function resolveUser() {
    const me = await requireCustomer();
    return { name: me.name || me.email, subtitle: t.customerRole };
  }

  const staticNav = [overview, orders, { ...wallet, reserve: true }, notifications, tickets];

  return (
    <WorkspaceShell
      // The static shell assumes the wallet shows: its place is held, and `resolveNav` drops the slot when it does not.
      nav={staticNav}
      footerNav={footerNav}
      tabs={staticNav}
      resolveNav={resolveNav}
      areaLabel={t.customerArea}
      homeHref={p("/account")}
      roleLabel={t.customerRole}
      resolveUser={resolveUser}
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
          <Suspense fallback={<Skeleton className="h-11 w-32 rounded-control max-sm:hidden" />}>
            <WalletPill />
          </Suspense>
        </>
      }
      search={{ action: p("/services"), label: t.searchServices, placeholder: t.searchServices, submitLabel: c.actions.search }}
    >
      <Suspense fallback={null}>
        <CustomerGate />
      </Suspense>
      {/* A page that waits for request data outside a boundary of its own shows this until it is ready. The element between
          the boundary and the page keeps a streamed page from playing its enter transition on the first load (React's
          streamed reveal animates a <ViewTransition> that is the first thing in the revealed content). */}
      <Suspense fallback={<WorkspaceMainSkeleton />}>
        <div className="contents">{children}</div>
      </Suspense>
    </WorkspaceShell>
  );
}
