// AccountArea: the signed-in state in the header: "Sign in" button, or wallet pill + account menu.
// It reads the session cookies, so it must be rendered inside <Suspense fallback={<AccountAreaSkeleton />}>.
// A merchant and a customer can be signed in at once: the menu then lists both, and the pill is the merchant's.
// The customer's pill and "Wallet" menu item show when the customer wallet does (`walletCapabilities().show`, plan D7).
import { cache, Suspense } from "react";
import { cookies } from "next/headers";
import { ClipboardList, LayoutDashboard, LogIn, UserRound, Wallet } from "lucide-react";
import { ApiError } from "@/lib/api/errors";
import { apiSessionGet } from "@/lib/api/server";
import { getCustomer, getMerchant, MERCHANT_CSRF_COOKIE, STORE_CSRF_COOKIE } from "@/lib/api/session";
import type { CustomerWallet, MerchantWallet } from "@/lib/api/types";
import { formatMoney } from "@/lib/format";
import { sitePath } from "@/lib/site-path";
import { common } from "@/lib/i18n/messages/common";
import { settle, type Settled } from "@/lib/merchant/load";
import { walletCapabilities } from "@/lib/wallet/view";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { BellSkeleton, BellSlot } from "@/components/notifications/bell-slot";
import Link from "next/link";
import { SignOutButton } from "./sign-out-button";

/**
 * The merchant's wallet (`GET /client/wallet`), or null when it cannot be shown (pending approval, signed out, error). Once
 * per request. No merchant session can exist without the readable CSRF cookie: the call is skipped for everyone else, so a
 * visitor who is signed out (or a customer) costs no API call, which lets the header start this read together with `me`.
 */
const getWallet = cache(async (): Promise<MerchantWallet | null> => {
  if (!(await cookies()).has(MERCHANT_CSRF_COOKIE)) return null;
  try {
    return await apiSessionGet<MerchantWallet>("/client/wallet");
  } catch {
    // 403 ACCOUNT_PENDING_APPROVAL and every other failure: no wallet pill; the header must never break the page.
    return null;
  }
});

/**
 * The customer's wallet (`GET /store/v1/me/wallet`, always USD) as this request's one read, kept as a result so a caller
 * can tell "no wallet to show" (a header: ignore a failure) from "could not load" (the wallet page: show the reference).
 * No-store, reads cookies: render the caller inside <Suspense>. Deduplicated per request: the account layout's pill and
 * nav item, the store header's pill and the wallet page ask once together.
 */
export const readCustomerWallet = cache(async (): Promise<Settled<CustomerWallet>> => {
  // No customer session can exist without the readable CSRF cookie: skip the call for a visitor who is signed out.
  if (!(await cookies()).has(STORE_CSRF_COOKIE)) return { ok: false, error: new ApiError({ status: 401, code: "UNAUTHORIZED" }) };
  return settle(apiSessionGet<CustomerWallet>("/store/v1/me/wallet"));
});

/** A same-size placeholder for the account area while the session is read. */
export function AccountAreaSkeleton({ compact }: { compact?: boolean }) {
  return compact ? <Skeleton className="size-11 rounded-full" /> : <Skeleton className="size-11 rounded-control sm:w-24" />;
}

async function AccountAreaContent({ compact }: { compact?: boolean }) {
  // The wallet reads start together with the session reads (plan P1.3): one API round trip instead of two. Each is skipped
  // by itself when its surface has no session cookie, and dropped below when the session turns out signed out (401) or the
  // merchant is pending. Personal reads stay no-store and per request. The compact shop header of a checkout (avatar only)
  // never reads the customer's wallet.
  const [merchant, customer, merchantWallet, customerRead] = await Promise.all([
    getMerchant().catch(() => null),
    getCustomer().catch(() => null),
    getWallet(),
    compact ? null : readCustomerWallet(),
  ]);
  const t = common;

  if (!merchant && !customer) {
    const signIn = sitePath("/sign-in");
    return (
      <>
        {/* Phones: an icon-only button keeps the header on one line. */}
        <Link
          href={signIn}
          aria-label={t.header.signIn}
          title={t.header.signIn}
          className={
            "inline-flex size-11 items-center justify-center rounded-control sm:hidden " +
            (compact ? "border border-line-strong bg-surface text-ink" : "bg-inverse text-on-inverse")
          }
        >
          <LogIn aria-hidden="true" className="size-5" />
        </Link>
        <span className="hidden sm:inline-flex">
          <ButtonLink href={signIn} variant={compact ? "secondary" : "primary"} size="md">
            {t.header.signIn}
          </ButtonLink>
        </span>
      </>
    );
  }

  const wallet = merchant && merchant.status !== "pending" ? merchantWallet : null;
  const customerWallet = customer && customerRead?.ok ? customerRead.data : null;
  const customerShows = customerWallet ? walletCapabilities(customerWallet).show : false;
  const name = merchant?.name || customer?.name || merchant?.email || customer?.email || "";
  const email = merchant?.email ?? customer?.email ?? "";
  const both = Boolean(merchant && customer);

  return (
    <div className="flex items-center gap-2">
      {/* The notification bell of the signed-in visitor (owner, 2026-11-15: the bell belongs in the shop header too, not only
          in /account and /merchant). It mounts the live stream (feature 27), so a stream opens wherever a signed-in visitor
          sees a bell; a signed-out visitor gets neither. A customer's bell when a customer is signed in, else the merchant's.
          Its own Suspense: the unread count streams in without holding back the rest of the account area. Not in the compact
          checkout header. */}
      {compact ? null : (
        <Suspense fallback={<BellSkeleton />}>
          <BellSlot surface={customer ? "customer" : "merchant"} />
        </Suspense>
      )}
      {wallet ? (
        <Link
          href={sitePath("/merchant/wallet")}
          aria-label={`${t.header.wallet}: ${wallet.available} USD`}
          className="btn-motion btn-lift-soft hidden h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-body font-bold hover:border-ink sm:inline-flex"
        >
          <Wallet aria-hidden="true" className="size-[18px]" />
          <Money amount={wallet.available} currency="USD" />
        </Link>
      ) : customerWallet && customerShows ? (
        <Link
          href={sitePath("/account/wallet")}
          aria-label={`${t.header.storeBalance}: ${formatMoney(customerWallet.available, "USD")}`}
          className="btn-motion btn-lift-soft hidden h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-body font-bold hover:border-ink sm:inline-flex"
        >
          <Wallet aria-hidden="true" className="size-[18px]" />
          <Money amount={customerWallet.available} currency="USD" />
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
          <MenuItem href={sitePath("/merchant")} icon={<LayoutDashboard aria-hidden="true" />}>
            {t.header.merchantPortal}
          </MenuItem>
        ) : null}
        {customer ? (
          <>
            <MenuItem href={sitePath("/account")} icon={<UserRound aria-hidden="true" />}>
              {t.header.myAccount}
            </MenuItem>
            <MenuItem href={sitePath("/account/orders")} icon={<ClipboardList aria-hidden="true" />}>
              {t.header.myOrders}
            </MenuItem>
            {customerShows ? (
              <MenuItem href={sitePath("/account/wallet")} icon={<Wallet aria-hidden="true" />}>
                {t.header.myWallet}
              </MenuItem>
            ) : null}
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
