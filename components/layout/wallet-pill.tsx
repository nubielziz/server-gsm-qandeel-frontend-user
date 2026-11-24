// The header pill with the account's spendable balance, linking to the wallet page. One component for both kinds of wallet:
// - a retail rank's store balance shows only when the wallet does (the shop switch is on, or a balance is left);
// - a merchant rank's wallet always shows, and its available amount (balance plus credit) is the one the API sends.
// The pill steps aside on phones (below `sm`) so the bell and the account menu fit at 360 px: the wallet is one tap away
// in the navigation. It never breaks its page: a wallet that cannot be read shows nothing.
// `WalletPill` reads cookies, so render it inside <Suspense>.
import Link from "next/link";
import { Wallet } from "lucide-react";
import { readAccountWallet, type AccountWalletRead } from "@/lib/account/wallet-read";
import { formatMoney } from "@/lib/format";
import { common } from "@/lib/i18n/messages/common";
import { portal } from "@/lib/i18n/messages/portal";
import { sitePath } from "@/lib/site-path";
import { walletCapabilities } from "@/lib/wallet/view";
import { Money } from "@/components/ui/money";

/** What the pill shows: where it goes, what it says to a screen reader and the amount. */
export type WalletPillModel = { href: string; label: string; amount: string };

/** Both kinds of wallet are in USD. */
const CURRENCY = "USD";

/** The pill for a wallet read, or null when it shows nothing (signed out, a failed read, a store balance that is hidden). */
export function walletPillOf(wallet: AccountWalletRead | null): WalletPillModel | null {
  if (!wallet || !wallet.read.ok) return null;
  const href = sitePath("/account/wallet");
  if (wallet.kind === "merchant") {
    return { href, label: portal.availableBalance, amount: wallet.read.data.available };
  }
  if (!walletCapabilities(wallet.read.data).show) return null;
  return { href, label: common.header.storeBalance, amount: wallet.read.data.available };
}

/** `frame`: inside the account area's header card. `header`: in the shop's header. */
const VARIANT_CLASS = {
  frame:
    "inline-flex h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-body font-bold transition-colors hover:bg-surface-muted max-sm:hidden",
  header:
    "btn-motion btn-lift-soft hidden h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-body font-bold hover:border-ink sm:inline-flex",
} as const;

export type WalletPillProps = { variant?: keyof typeof VARIANT_CLASS };

/** The pill itself, from a model made by `walletPillOf`. */
export function WalletPillLink({ pill, variant = "frame" }: { pill: WalletPillModel } & WalletPillProps) {
  return (
    <Link href={pill.href} aria-label={`${pill.label}: ${formatMoney(pill.amount, CURRENCY)}`} className={VARIANT_CLASS[variant]}>
      <Wallet aria-hidden="true" className="size-[18px]" />
      <Money amount={pill.amount} currency={CURRENCY} />
    </Link>
  );
}

/** The signed-in account's wallet pill, or nothing. The wallet is the request's one shared read (`readAccountWallet`). */
export async function WalletPill({ variant }: WalletPillProps) {
  const wallet = await readAccountWallet().catch(() => null);
  const pill = walletPillOf(wallet);
  return pill ? <WalletPillLink pill={pill} variant={variant} /> : null;
}
