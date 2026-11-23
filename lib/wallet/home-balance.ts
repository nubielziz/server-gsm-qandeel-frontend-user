// What the home page's balance box shows (owner, 2026-11-23: the box took the place of the quick IMEI check). Pure: the
// component reads the sessions and the wallets of the request, this decides what they mean. Unit-tested.
import type { CustomerWallet, MerchantMe, MerchantWallet } from "@/lib/api/types";
import { walletCapabilities } from "./view";

/** What the reads of one request found. A wallet that does not exist, or could not be read, is null. */
export type HomeBalanceInput = {
  merchant: Pick<MerchantMe, "status"> | null;
  merchantWallet: Pick<MerchantWallet, "available"> | null;
  /** Whether a customer is signed in. */
  customer: boolean;
  customerWallet: Pick<CustomerWallet, "available" | "balance" | "enabled" | "frozen"> | null;
};

export type HomeBalance =
  /** Nobody is signed in: the box invites the visitor to sign in. */
  | { kind: "signedOut" }
  /**
   * Signed in, but there is no balance to show: a merchant waiting for approval, a customer wallet that is switched off and
   * empty, or a wallet that could not be read (the box must never break the home page).
   */
  | { kind: "noWallet"; account: "merchant" | "customer" }
  /** The available balance (USD, a 4-decimal string) and whether "Add funds" is offered. */
  | { kind: "balance"; account: "merchant" | "customer"; available: string; canAddFunds: boolean };

/**
 * Whose balance the box shows. The same choice as the header's pill: the merchant's when a merchant is signed in and
 * approved, else the customer's when the customer wallet shows (`walletCapabilities().show`, plan D7).
 */
export function homeBalance({ merchant, merchantWallet, customer, customerWallet }: HomeBalanceInput): HomeBalance {
  if (merchant && merchant.status !== "pending" && merchantWallet) {
    return { kind: "balance", account: "merchant", available: merchantWallet.available, canAddFunds: true };
  }
  if (customer && customerWallet) {
    const capabilities = walletCapabilities(customerWallet);
    if (capabilities.show) {
      return { kind: "balance", account: "customer", available: customerWallet.available, canAddFunds: capabilities.canAddFunds };
    }
  }
  if (customer) return { kind: "noWallet", account: "customer" };
  if (merchant) return { kind: "noWallet", account: "merchant" };
  return { kind: "signedOut" };
}
