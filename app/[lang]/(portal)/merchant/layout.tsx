// Merchant portal frame (mockups "Workspace", "Account Settings", "Invoices"): dark icon rail, header card with the
// service search, the wallet pill and the avatar menu. The whole frame depends on who is signed in, so it streams
// behind <Suspense> (the static shell is the same-size skeleton). Signed out → sign-in (merchant tab).
// A merchant waiting for approval (`status: pending`) gets 403 ACCOUNT_PENDING_APPROVAL on 32 routes (handoff §4.15):
// the nav then shows only what works for them (overview, settings) and a banner explains the wait.
import { Suspense, cache } from "react";
import Link from "next/link";
import {
  ClipboardList,
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
import { requireMerchant } from "@/lib/api/session";
import type { MerchantWallet } from "@/lib/api/types";
import { localePath } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { common } from "@/lib/i18n/messages/common";
import { portal } from "@/lib/i18n/messages/portal";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { WorkspaceShell, WorkspaceShellSkeleton, type WorkspaceNavItem } from "@/components/layout/workspace-shell";
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

async function WalletPill() {
  const [locale, t, wallet] = await Promise.all([getLocale(), getMessages(portal), getWallet()]);
  if (!wallet) return null;
  return (
    <Link
      href={localePath(locale, "/merchant/wallet")}
      aria-label={`${t.availableBalance}: ${wallet.available} USD`}
      className="inline-flex h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-body font-bold transition-colors hover:bg-surface-muted"
    >
      <Wallet aria-hidden="true" className="size-[18px]" />
      <Money amount={wallet.available} currency="USD" locale={locale} />
    </Link>
  );
}

async function MerchantFrame({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const [me, t, c] = await Promise.all([requireMerchant(locale), getMessages(portal), getMessages(common)]);
  const pending = me.status === "pending";
  const p = (path: string) => localePath(locale, path);
  const icon = "size-5";

  const nav: WorkspaceNavItem[] = pending
    ? [{ href: p("/merchant"), label: t.merchantNav.overview, icon: <LayoutDashboard aria-hidden="true" className={icon} />, match: "exact" }]
    : [
        { href: p("/merchant"), label: t.merchantNav.overview, icon: <LayoutDashboard aria-hidden="true" className={icon} />, match: "exact" },
        { href: p("/merchant/services"), label: t.merchantNav.services, title: t.servicesTitle, icon: <PlusCircle aria-hidden="true" className={icon} /> },
        { href: p("/merchant/orders"), label: t.merchantNav.orders, icon: <ClipboardList aria-hidden="true" className={icon} /> },
        { href: p("/merchant/wallet"), label: t.merchantNav.wallet, icon: <Wallet aria-hidden="true" className={icon} /> },
        { href: p("/merchant/invoices"), label: t.merchantNav.invoices, icon: <ReceiptText aria-hidden="true" className={icon} /> },
        { href: p("/merchant/api-keys"), label: t.merchantNav.apiKeys, icon: <KeyRound aria-hidden="true" className={icon} /> },
        { href: p("/merchant/webhooks"), label: t.merchantNav.webhooks, icon: <Webhook aria-hidden="true" className={icon} /> },
        { href: p("/merchant/referrals"), label: t.merchantNav.referrals, icon: <Gift aria-hidden="true" className={icon} /> },
      ];
  const footerNav: WorkspaceNavItem[] = [
    { href: p("/merchant/settings"), label: t.merchantNav.settings, icon: <Settings aria-hidden="true" className={icon} /> },
  ];

  return (
    <WorkspaceShell
      nav={nav}
      footerNav={footerNav}
      areaLabel={t.merchantArea}
      homeHref={p("/merchant")}
      user={{ name: me.name || me.email, subtitle: me.company || t.merchantRole }}
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
        pending ? (
          <Badge tone="warning">{t.pending.badge}</Badge>
        ) : (
          <Suspense fallback={<Skeleton className="h-11 w-32 rounded-control" />}>
            <WalletPill />
          </Suspense>
        )
      }
      search={
        pending
          ? undefined
          : { action: p("/merchant/services"), label: t.searchServices, placeholder: t.searchServices, submitLabel: c.actions.search }
      }
    >
      {pending ? (
        <Alert tone="warning" title={t.pending.title} className="mb-4">
          {t.pending.body}
        </Alert>
      ) : null}
      {children}
    </WorkspaceShell>
  );
}

// No ChromeProviders here: WorkspaceShell mounts it (a second one would render a second <Toaster />).
export default function MerchantLayout({ children }: LayoutProps<"/[lang]/merchant">) {
  return (
    <Suspense fallback={<WorkspaceShellSkeleton />}>
      <MerchantFrame>{children}</MerchantFrame>
    </Suspense>
  );
}
