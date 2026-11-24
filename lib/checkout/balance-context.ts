// What the review page knows about the store balance of whoever is signed in, from the two reads the server makes for the
// request (who is signed in, and their wallet). Pure: the page does the reading, this decides what the view is told.
// The store balance belongs to the retail rank. An account of a merchant rank has no store balance to pay with, so it is told
// there is none (the view then offers the payment methods only), whatever else was read. The backend refuses a balance
// payment from a merchant rank in the same way (403 RANK_NOT_ALLOWED).
import type { BalanceContext } from "@/components/checkout/balance-option";
import { rankKindOf, type RankSource } from "@/lib/account/family";
import type { AccountWalletRead } from "@/lib/account/wallet-read";
import { walletCapabilities } from "@/lib/wallet/view";

/**
 * Who is signed in and which store balance the choice may show.
 *
 * - Nobody signed in: `{ signedIn: false, wallet: null }`.
 * - A merchant rank: signed in, no store balance (its wallet is never looked at).
 * - A retail rank with the store wallet read: the three facts the choice needs. A wallet that could not be read, or a read of
 *   the other kind of wallet, leaves the balance out; the payment methods keep working.
 *
 * @param me the signed-in account, or null
 * @param walletRead the account's wallet as `readAccountWallet()` returns it, or null when it was not read
 */
export function balanceContextFor(
  me: RankSource | null | undefined,
  walletRead: AccountWalletRead | null | undefined,
): BalanceContext {
  if (!me) return { signedIn: false, wallet: null };
  if (rankKindOf(me) === "merchant" || walletRead?.kind !== "store" || !walletRead.read.ok)
    return { signedIn: true, wallet: null };
  const wallet = walletRead.read.data;
  return {
    signedIn: true,
    wallet: { enabled: wallet.enabled === true, available: wallet.available, frozen: walletCapabilities(wallet).frozen },
  };
}
