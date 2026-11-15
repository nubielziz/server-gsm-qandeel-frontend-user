// Merchant portal frame (mockups "Workspace", "Account Settings", "Invoices"): dark icon rail, header card with the
// service search, the wallet pill and the avatar menu. The frame is part of the static shell (plan P1.4): the rail, the
// header with the section title, the menu button and drawer, the search and the main area are prerendered with no
// personal data in them, and only what depends on who is signed in streams in small holes: the avatar and name, the
// nav lists, the wallet pill and the bell. The page itself sits behind the session read (the main hole below), because
// the password gate wraps it. Signed out → sign-in (merchant tab).
// A merchant waiting for approval (`status: pending`) gets 403 ACCOUNT_PENDING_APPROVAL on 32 routes (handoff §4.15):
// the nav then shows only what works for them (overview, settings), a badge replaces the wallet pill and a banner
// explains the wait. The static shell shows the full nav and the search, as for an approved merchant (almost every
// merchant is one); for a pending one the nav shrinks and the badge replaces the pill once the session is read.
// A merchant with `mustChangePassword` (a temporary password from staff) is sent to the security page by the gate
// around the page content (plan D5) until the password is changed.
import { Suspense, cache, type ReactNode } from "react";
import Link from "next/link";
import {
  Bell,
  ClipboardList,
  Clock,
  Gift,
  KeyRound,
  LayoutDashboard,
  PlusCircle,
  ReceiptText,
  Settings,
  Store,
  Wallet,
  Webhook,
} from "lucide-react";
import { apiSessionGet } from "@/lib/api/server";
import { getMerchant, requireMerchant } from "@/lib/api/session";
import type { MerchantWallet } from "@/lib/api/types";
import { localePath, type Locale } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { common } from "@/lib/i18n/messages/common";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { portal } from "@/lib/i18n/messages/portal";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { BellSkeleton, BellSlot } from "@/components/notifications/bell-slot";
import { WorkspaceMainSkeleton, WorkspaceShell, type WorkspaceNavItem } from "@/components/layout/workspace-shell";
import { MustChangePasswordGate } from "@/components/merchant/must-change-password-gate";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";

const getWallet = cache(async (): Promise<MerchantWallet | null> => {
  try {
    return await apiSessionGet<MerchantWallet>("/client/wallet");
  } catch {
    return null; // the header must never break the page
  }
});

/**
 * The header's status: a badge for a merchant waiting for approval (on a phone it shrinks to its clock icon; the banner
 * below says the same in words, so the bell fits), else the wallet pill. The wallet is read together with `me`, and
 * ignored for a pending merchant (the API answers 403 for them).
 */
async function HeaderStatus({ locale }: { locale: Locale }) {
  const [t, me, wallet] = await Promise.all([getMessages(portal), getMerchant().catch(() => null), getWallet()]);
  if (me?.status === "pending") {
    return (
      <Badge tone="warning" icon={<Clock aria-hidden="true" className="sm:hidden" />}>
        <span className="max-sm:sr-only">{t.pending.badge}</span>
      </Badge>
    );
  }
  if (!wallet) return null;
  return (
    <Link
      href={localePath(locale, "/merchant/wallet")}
      aria-label={`${t.availableBalance}: ${wallet.available} USD`}
      className="inline-flex h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-body font-bold transition-colors hover:bg-surface-muted max-sm:hidden"
    >
      <Wallet aria-hidden="true" className="size-[18px]" />
      <Money amount={wallet.available} currency="USD" locale={locale} />
    </Link>
  );
}

/**
 * The page: the session gate (signed out → sign-in), the approval banner and the password gate around the page.
 * It waits for `me`, so the page's own reads start after it (as they always did); the rest of the frame does not.
 */
async function MerchantMain({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [me, t, settings] = await Promise.all([requireMerchant(locale), getMessages(portal), getMessages(merchantSettings)]);
  return (
    <>
      {me.status === "pending" ? (
        <Alert tone="warning" title={t.pending.title} className="mb-4">
          {t.pending.body}
        </Alert>
      ) : null}
      <MustChangePasswordGate
        mustChange={me.mustChangePassword === true}
        securityPath={localePath(locale, "/merchant/settings/security")}
        title={settings.security.mustChange.title}
        text={settings.security.mustChange.text}
      >
        {children}
      </MustChangePasswordGate>
    </>
  );
}

// No ChromeProviders here: WorkspaceShell mounts it (a second one would render a second <Toaster />).
export default async function MerchantLayout({ children }: LayoutProps<"/[lang]/merchant">) {
  const locale = await getLocale();
  const [t, c] = await Promise.all([getMessages(portal), getMessages(common)]);
  const p = (path: string) => localePath(locale, path);
  const icon = "size-5";

  const overview: WorkspaceNavItem = { href: p("/merchant"), label: t.merchantNav.overview, icon: <LayoutDashboard aria-hidden="true" className={icon} />, match: "exact" };
  const notifications: WorkspaceNavItem = {
    href: p("/merchant/notifications"),
    label: t.merchantNav.notifications,
    icon: <Bell aria-hidden="true" className={icon} />,
  };
  const approvedNav: WorkspaceNavItem[] = [
    overview,
    { href: p("/merchant/services"), label: t.merchantNav.services, title: t.servicesTitle, icon: <PlusCircle aria-hidden="true" className={icon} /> },
    { href: p("/merchant/orders"), label: t.merchantNav.orders, icon: <ClipboardList aria-hidden="true" className={icon} /> },
    { href: p("/merchant/wallet"), label: t.merchantNav.wallet, icon: <Wallet aria-hidden="true" className={icon} /> },
    { href: p("/merchant/invoices"), label: t.merchantNav.invoices, icon: <ReceiptText aria-hidden="true" className={icon} /> },
    { href: p("/merchant/api-keys"), label: t.merchantNav.apiKeys, icon: <KeyRound aria-hidden="true" className={icon} /> },
    { href: p("/merchant/webhooks"), label: t.merchantNav.webhooks, icon: <Webhook aria-hidden="true" className={icon} /> },
    { href: p("/merchant/referrals"), label: t.merchantNav.referrals, icon: <Gift aria-hidden="true" className={icon} /> },
    notifications,
  ];
  const pendingNav: WorkspaceNavItem[] = [overview, notifications];
  const footerNav: WorkspaceNavItem[] = [
    { href: p("/merchant/settings"), label: t.merchantNav.settings, icon: <Settings aria-hidden="true" className={icon} /> },
  ];

  async function resolveNav() {
    const me = await getMerchant().catch(() => null);
    return { nav: me?.status === "pending" ? pendingNav : approvedNav, footerNav };
  }

  async function resolveUser() {
    const me = await requireMerchant(locale);
    return { name: me.name || me.email, subtitle: me.company || t.merchantRole };
  }

  return (
    <WorkspaceShell
      nav={approvedNav}
      footerNav={footerNav}
      resolveNav={resolveNav}
      areaLabel={t.merchantArea}
      homeHref={p("/merchant")}
      roleLabel={t.merchantRole}
      resolveUser={resolveUser}
      userMenu={
        <>
          <MenuItem href={p("/merchant/settings")} icon={<Settings aria-hidden="true" />}>
            {t.merchantNav.settings}
          </MenuItem>
          <MenuItem href={p("/")} icon={<Store aria-hidden="true" />}>
            {t.merchantNav.shop}
          </MenuItem>
          <MenuSeparator />
          <SignOutButton surface="merchant" label={c.header.signOut} pendingLabel={c.header.signingOut} />
        </>
      }
      headerSlot={
        <>
          <Suspense fallback={<BellSkeleton />}>
            <BellSlot surface="merchant" />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-11 w-32 rounded-control max-sm:hidden" />}>
            <HeaderStatus locale={locale} />
          </Suspense>
        </>
      }
      search={{ action: p("/merchant/services"), label: t.searchServices, placeholder: t.searchServices, submitLabel: c.actions.search }}
    >
      <Suspense fallback={<WorkspaceMainSkeleton />}>
        <MerchantMain locale={locale}>{children}</MerchantMain>
      </Suspense>
    </WorkspaceShell>
  );
}
