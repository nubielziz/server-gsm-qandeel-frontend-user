// AccountArea: the signed-in state in the header: "Sign in" button, or wallet pill + account menu.
// It reads the session cookies, so it must be rendered inside <Suspense fallback={<AccountAreaSkeleton />}>.
// A merchant and a customer can be signed in at once: the menu then lists both.
import { cache, Suspense } from "react";
import { ClipboardList, LayoutDashboard, LogIn, UserRound, Wallet } from "lucide-react";
import { apiSessionGet } from "@/lib/api/server";
import { getCustomer, getMerchant } from "@/lib/api/session";
import type { MerchantWallet } from "@/lib/api/types";
import { localePath } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { common } from "@/lib/i18n/messages/common";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { SignOutButton } from "./sign-out-button";

/** The merchant's wallet (`GET /client/wallet`), or null when it cannot be shown (pending approval, signed out, error). Once per request. */
const getWallet = cache(async (): Promise<MerchantWallet | null> => {
  try {
    return await apiSessionGet<MerchantWallet>("/client/wallet");
  } catch {
    // 403 ACCOUNT_PENDING_APPROVAL and every other failure: no wallet pill; the header must never break the page.
    return null;
  }
});

/** A same-size placeholder for the account area while the session is read. */
export function AccountAreaSkeleton({ compact }: { compact?: boolean }) {
  return compact ? <Skeleton className="size-11 rounded-full" /> : <Skeleton className="size-11 rounded-control sm:w-24" />;
}

async function AccountAreaContent({ compact }: { compact?: boolean }) {
  const [locale, t, merchant, customer] = await Promise.all([
    getLocale(),
    getMessages(common),
    getMerchant().catch(() => null),
    getCustomer().catch(() => null),
  ]);

  if (!merchant && !customer) {
    const signIn = localePath(locale, "/sign-in");
    return (
      <>
        {/* Phones: an icon-only button keeps the header on one line, in both languages. */}
        <Link
          href={signIn}
          aria-label={t.header.signIn}
          title={t.header.signIn}
          className={
            "inline-flex size-11 items-center justify-center rounded-control sm:hidden " +
            (compact ? "border border-line-strong bg-surface text-ink" : "bg-inverse text-on-inverse")
          }
        >
          <LogIn aria-hidden="true" className="size-5 rtl:-scale-x-100" />
        </Link>
        <span className="hidden sm:inline-flex">
          <ButtonLink href={signIn} variant={compact ? "secondary" : "primary"} size="md">
            {t.header.signIn}
          </ButtonLink>
        </span>
      </>
    );
  }

  const wallet = merchant && merchant.status !== "pending" ? await getWallet() : null;
  const name = merchant?.name || customer?.name || merchant?.email || customer?.email || "";
  const email = merchant?.email ?? customer?.email ?? "";
  const both = Boolean(merchant && customer);

  return (
    <div className="flex items-center gap-2">
      {wallet ? (
        <Link
          href={localePath(locale, "/merchant/wallet")}
          aria-label={`${t.header.wallet}: ${wallet.available} USD`}
          className="hidden h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-body font-bold transition-colors hover:bg-surface-muted sm:inline-flex"
        >
          <Wallet aria-hidden="true" className="size-[18px]" />
          <Money amount={wallet.available} currency="USD" locale={locale} />
        </Link>
      ) : null}
      <Menu
        label={t.header.accountMenu}
        align="end"
        chevron={!compact}
        trigger={
          <>
            <Avatar name={name} size="md" />
            {compact ? null : <span className="sr-only">{name}</span>}
          </>
        }
      >
        <MenuLabel>
          <p className="truncate text-body font-bold text-ink">{name}</p>
          {email ? <p className="truncate text-small text-ink-subtle">{email}</p> : null}
        </MenuLabel>
        <MenuSeparator />
        {merchant ? (
          <MenuItem href={localePath(locale, "/merchant")} icon={<LayoutDashboard aria-hidden="true" />}>
            {t.header.merchantPortal}
          </MenuItem>
        ) : null}
        {customer ? (
          <>
            <MenuItem href={localePath(locale, "/account")} icon={<UserRound aria-hidden="true" />}>
              {t.header.myAccount}
            </MenuItem>
            <MenuItem href={localePath(locale, "/account/orders")} icon={<ClipboardList aria-hidden="true" />}>
              {t.header.myOrders}
            </MenuItem>
          </>
        ) : null}
        <MenuSeparator />
        {merchant ? (
          <SignOutButton
            surface="merchant"
            label={both ? t.header.signOutMerchant : t.header.signOut}
            pendingLabel={t.header.signingOut}
          />
        ) : null}
        {customer ? (
          <SignOutButton
            surface="customer"
            label={both ? t.header.signOutCustomer : t.header.signOut}
            pendingLabel={t.header.signingOut}
          />
        ) : null}
      </Menu>
    </div>
  );
}

export type AccountAreaProps = {
  /** Compact (checkout header): avatar only, no wallet pill, no chevron. */
  compact?: boolean;
};

/** Sign in button, or wallet pill + account menu. Wraps itself in <Suspense> with a same-size skeleton. */
export function AccountArea({ compact }: AccountAreaProps) {
  return (
    <Suspense fallback={<AccountAreaSkeleton compact={compact} />}>
      <AccountAreaContent compact={compact} />
    </Suspense>
  );
}
