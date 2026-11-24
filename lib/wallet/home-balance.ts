// What the home page's balance box shows (owner, 2026-11-23: the box took the place of the quick IMEI check). Pure: the
// component reads the account's wallet, this decides what it means. Unit-tested.
// One account type has one live wallet, of the kind its rank has: a merchant rank's portal wallet, or a retail rank's store
// balance. Both are read through `readAccountWallet` (lib/account/wallet-read.ts), so the box and the header pill cannot
// disagree about whose balance it is.
import type { CustomerWallet, MerchantWallet } from "@/lib/api/types";
import { walletCapabilities } from "./view";

/** The result of one wallet read, as `Settled` keeps it. */
type Read<T> = { ok: true; data: T } | { ok: false };

/**
 * The wallet of the signed-in account: the kind of wallet its rank has, and what the read found. The answer of
 * `readAccountWallet` fits this type as it is.
 */
export type HomeBalanceWallet =
  | { kind: "merchant"; read: Read<Pick<MerchantWallet, "available">> }
  | { kind: "store"; read: Read<Pick<CustomerWallet, "available" | "balance" | "enabled" | "frozen">> };

export type HomeBalance =
  /** Nobody is signed in: the box invites the visitor to sign in. */
  | { kind: "signedOut" }
  /**
   * Signed in, but there is no balance to show: a store balance that is switched off and empty, or a wallet that could not be
   * read (the box must never break the home page).
   */
  | { kind: "noWallet" }
  /** The available balance (USD, a 4-decimal string) and whether "Add funds" is offered. */
  | { kind: "balance"; available: string; canAddFunds: boolean };

/**
 * What the box shows for the account's wallet (null: nobody is signed in, or who is signed in could not be read).
 * - A merchant rank: its available amount (balance plus credit, as the API sends it), and Add funds always (invoices).
 * - A retail rank: the store balance when it shows (`walletCapabilities().show`), and Add funds only while the shop switch is on.
 * - A wallet that could not be read: no amount.
 */
export function homeBalance(wallet: HomeBalanceWallet | null): HomeBalance {
  if (!wallet) return { kind: "signedOut" };
  if (!wallet.read.ok) return { kind: "noWallet" };
  if (wallet.kind === "merchant") {
    return { kind: "balance", available: wallet.read.data.available, canAddFunds: true };
  }
  const capabilities = walletCapabilities(wallet.read.data);
  if (!capabilities.show) return { kind: "noWallet" };
  return { kind: "balance", available: wallet.read.data.available, canAddFunds: capabilities.canAddFunds };
}
