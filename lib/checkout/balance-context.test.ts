// The store balance the review page offers: only a retail rank has one, and a failed read leaves it out (the payment methods
// keep working).
import { describe, expect, it } from "vitest";
import { balanceOption } from "@/components/checkout/balance-option";
import type { AccountWalletRead } from "@/lib/account/wallet-read";
import type { CustomerWallet, MerchantWallet } from "@/lib/api/types";
import { balanceContextFor } from "./balance-context";

const retail = { rank: { kind: "retail" } };
const merchant = { rank: { kind: "merchant" } };

const storeWallet = (over: Partial<CustomerWallet> = {}): CustomerWallet =>
  ({ enabled: true, currency: "USD", balance: "20.0000", available: "20.0000", frozen: null, ...over }) as CustomerWallet;
const merchantWallet = { balance: "10.0000", reserved: "0.0000", creditLimit: "5.0000", available: "15.0000" } as MerchantWallet;

const storeRead = (over: Partial<CustomerWallet> = {}): AccountWalletRead => ({
  kind: "store",
  read: { ok: true, data: storeWallet(over) },
});
const merchantRead: AccountWalletRead = { kind: "merchant", read: { ok: true, data: merchantWallet } };

describe("balanceContextFor", () => {
  it("says nobody is signed in when there is no account, and keeps the wallet out", () => {
    expect(balanceContextFor(null, null)).toEqual({ signedIn: false, wallet: null });
    expect(balanceContextFor(undefined, storeRead())).toEqual({ signedIn: false, wallet: null });
  });

  it("gives a merchant rank no store balance, whatever wallet was read", () => {
    expect(balanceContextFor(merchant, null)).toEqual({ signedIn: true, wallet: null });
    expect(balanceContextFor(merchant, merchantRead)).toEqual({ signedIn: true, wallet: null });
    // Even a store wallet read for the account (a rank that changed under a cached read) is not offered.
    expect(balanceContextFor(merchant, storeRead())).toEqual({ signedIn: true, wallet: null });
  });

  it("gives a retail rank its store balance: the switch, what is available and whether it is on hold", () => {
    expect(balanceContextFor(retail, storeRead())).toEqual({
      signedIn: true,
      wallet: { enabled: true, available: "20.0000", frozen: false },
    });
    expect(balanceContextFor(retail, storeRead({ frozen: { at: "2026-11-20T08:00:00.000Z" }, available: "0.0000" }))).toEqual({
      signedIn: true,
      wallet: { enabled: true, available: "0.0000", frozen: true },
    });
    expect(balanceContextFor(retail, storeRead({ enabled: false }))).toEqual({
      signedIn: true,
      wallet: { enabled: false, available: "20.0000", frozen: false },
    });
  });

  it("treats a rank kind it does not know as retail (fails closed to the retail rights)", () => {
    expect(balanceContextFor({ rank: { kind: "partner" } }, storeRead())).toMatchObject({
      signedIn: true,
      wallet: { available: "20.0000" },
    });
    expect(balanceContextFor({}, storeRead())).toMatchObject({ signedIn: true, wallet: { available: "20.0000" } });
  });

  it("leaves the balance out when the wallet could not be read or is not the store wallet; the account stays signed in", () => {
    expect(balanceContextFor(retail, null)).toEqual({ signedIn: true, wallet: null });
    expect(balanceContextFor(retail, { kind: "store", read: { ok: false, error: new Error("down") } })).toEqual({
      signedIn: true,
      wallet: null,
    });
    expect(balanceContextFor(retail, merchantRead)).toEqual({ signedIn: true, wallet: null });
  });

  it("never lets a merchant rank pay from a balance: the choice is hidden, even for a checkout the balance could pay", () => {
    const context = balanceContextFor(merchant, storeRead());
    const option = balanceOption({ balancePayable: true, usdGross: "4.7500", ...context });
    expect(option).toEqual({ kind: "hidden" });
    // The same checkout for a retail rank with enough funds is payable.
    const retailOption = balanceOption({ balancePayable: true, usdGross: "4.7500", ...balanceContextFor(retail, storeRead()) });
    expect(retailOption).toEqual({ kind: "ready", available: "20.0000", total: "4.7500" });
  });
});
