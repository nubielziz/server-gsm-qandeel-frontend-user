// The one account frame: a dark icon rail, a header card with the search, the wallet pill and the avatar menu. Every account
// has it, whatever its rank; the rank only decides which places the lists hold (lib/account/nav.ts). The frame is part of the
// static shell: the rail, the header with the section title, the menu button and drawer, the search and the main area are
// prerendered with no personal data in them (the retail list, the wallet's place held), and only what depends on who is signed
// in streams in small holes: the lists of the account's rank, the search, the avatar and name, the wallet pill and the bell.
// The page itself sits behind the session read (the main hole below): the password gate wraps it, and a visitor who is signed
// out goes to sign-in.
// Live badges (components/layout/workspace-badges.tsx): the unread notifications, a dot while support wrote something unseen,
// and the orders in progress, each its own uncached read in its own <Suspense>, for the API family of the account's rank. They
// come with the lists of the session, so the static shell has none. Below `lg` a tab bar holds up to five places.
import { Suspense, type ReactNode } from "react";
import {
  Bell,
  ClipboardList,
  Headset,
  LayoutDashboard,
  PlusCircle,
  ReceiptText,
  Settings,
  Store,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { capabilitiesOf } from "@/lib/account/capabilities";
import { familyOf, type AccountFamily } from "@/lib/account/family";
import {
  accountNav,
  accountPageTitles,
  accountSearch,
  accountSubtitle,
  securityPageHref,
  staticAccountNav,
  storeWalletShows,
  type AccountNavEntry,
  type AccountNavId,
} from "@/lib/account/nav";
import { readAccountWallet } from "@/lib/account/wallet-read";
import { getAccount, requireAccount } from "@/lib/api/session";
import { common } from "@/lib/i18n/messages/common";
import { portal } from "@/lib/i18n/messages/portal";
import { sitePath } from "@/lib/site-path";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { WalletPill } from "@/components/layout/wallet-pill";
import { NotificationsNavBadge, OrdersNavBadge, SupportNavBadge } from "@/components/layout/workspace-badges";
import {
  WorkspaceMainSkeleton,
  WorkspaceShell,
  type WorkspaceNavItem,
  type WorkspaceNavLists,
  type WorkspaceSearch,
  type WorkspaceUser,
} from "@/components/layout/workspace-shell";
import { MustChangePasswordGate } from "@/components/merchant/must-change-password-gate";
import { BellSkeleton, BellSlot } from "@/components/notifications/bell-slot";
import { MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";

const ICONS: Record<AccountNavId, LucideIcon> = {
  overview: LayoutDashboard,
  priceList: PlusCircle,
  orders: ClipboardList,
  wallet: Wallet,
  invoices: ReceiptText,
  notifications: Bell,
  support: Headset,
  settings: Settings,
};

/** The live badge of a place, for the API family of the account; most places have none. */
function badgeOf(id: AccountNavId, family: AccountFamily): ReactNode {
  if (id === "orders") return <OrdersNavBadge family={family} />;
  if (id === "notifications") return <NotificationsNavBadge family={family} />;
  if (id === "support") return <SupportNavBadge family={family} />;
  return undefined;
}

/** A place of the frame as a nav item: its words, its icon and (once the family is known) its live badge. */
function itemOf(entry: AccountNavEntry, family?: AccountFamily): WorkspaceNavItem {
  const Icon = ICONS[entry.id];
  return {
    href: entry.href,
    label: entry.label,
    shortLabel: entry.shortLabel,
    title: entry.title,
    match: entry.match,
    reserve: entry.reserve,
    icon: <Icon aria-hidden="true" className="size-5" />,
    badge: family ? badgeOf(entry.id, family) : undefined,
  };
}

/**
 * The lists of the signed-in account's rank. A merchant rank's wallet always shows, so its wallet is not read here; a retail
 * rank's shows only while its store wallet does (the read is the one the header pill shares). An account that cannot be read
 * gets the retail list: the frame never breaks on it.
 */
async function resolveNav(): Promise<WorkspaceNavLists> {
  const me = await getAccount().catch(() => null);
  const caps = capabilitiesOf(me);
  const wallet = me && caps.rankKind === "retail" ? await readAccountWallet().catch(() => null) : null;
  const lists = accountNav(caps, storeWalletShows(wallet));
  const family = caps.family;
  return {
    nav: lists.nav.map((entry) => itemOf(entry, family)),
    footerNav: lists.footerNav.map((entry) => itemOf(entry, family)),
    tabs: lists.tabs.map((entry) => itemOf(entry, family)),
  };
}

/** The signed-in person (a visitor who is signed out goes to sign-in): the name, and the company or else the rank's name. */
async function resolveUser(): Promise<WorkspaceUser> {
  const me = await requireAccount();
  return { name: me.name || me.email, subtitle: accountSubtitle(me) };
}

/** The header search of the account's rank. A failed read gives the shop's search, which every account may use. */
async function resolveSearch(): Promise<WorkspaceSearch> {
  return accountSearch(capabilitiesOf(await getAccount().catch(() => null)));
}

/** The bell of the account's API family. It never breaks the page: no account, no bell. */
async function AccountBell() {
  const me = await getAccount().catch(() => null);
  return me ? <BellSlot family={familyOf(me)} /> : null;
}

/**
 * The page: the session gate (signed out goes to sign-in) and the password gate around it. It waits for the account, so the
 * page's own reads start after it (as they always did); the rest of the frame does not wait for it.
 */
async function AccountMain({ children }: { children: ReactNode }) {
  const me = await requireAccount();
  const t = portal;
  return (
    <MustChangePasswordGate
      mustChange={me.mustChangePassword === true}
      securityPath={securityPageHref()}
      title={t.mustChange.title}
      text={t.mustChange.text}
    >
      {children}
    </MustChangePasswordGate>
  );
}

// No ChromeProviders here: WorkspaceShell mounts it (a second one would render a second <Toaster />).
export default function AccountLayout({ children }: LayoutProps<"/en/account">) {
  const t = portal;
  const c = common;
  const lists = staticAccountNav();

  return (
    <WorkspaceShell
      // The static shell draws the retail list with the wallet's place held; `resolveNav` swaps in the account's own.
      nav={lists.nav.map((entry) => itemOf(entry))}
      footerNav={lists.footerNav.map((entry) => itemOf(entry))}
      tabs={lists.tabs.map((entry) => itemOf(entry))}
      titles={accountPageTitles()}
      resolveNav={resolveNav}
      areaLabel={t.area}
      homeHref={sitePath("/account")}
      roleLabel={t.accountRole}
      resolveUser={resolveUser}
      userMenu={
        <>
          <MenuItem href={sitePath("/account/settings")} icon={<Settings aria-hidden="true" />}>
            {t.nav.settings}
          </MenuItem>
          <MenuItem href={sitePath("/")} icon={<Store aria-hidden="true" />}>
            {t.nav.shop}
          </MenuItem>
          <MenuSeparator />
          <SignOutButton label={c.header.signOut} pendingLabel={c.header.signingOut} />
        </>
      }
      headerSlot={
        <>
          <Suspense fallback={<BellSkeleton />}>
            <AccountBell />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-11 w-32 rounded-control max-sm:hidden" />}>
            <WalletPill />
          </Suspense>
        </>
      }
      search={accountSearch({ priceList: false })}
      resolveSearch={resolveSearch}
    >
      {/* The element between the boundary and the page keeps the streamed page from playing its enter transition on the
          first load (React's streamed reveal animates a <ViewTransition> that is the first thing in the revealed content). */}
      <Suspense fallback={<WorkspaceMainSkeleton />}>
        <div className="contents">
          <AccountMain>{children}</AccountMain>
        </div>
      </Suspense>
    </WorkspaceShell>
  );
}
