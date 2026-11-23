import { describe, expect, it } from "vitest";
import { homeBalance, type HomeBalanceInput } from "./home-balance";

const NOBODY: HomeBalanceInput = { merchant: null, merchantWallet: null, customer: false, customerWallet: null };
const CUSTOMER_WALLET = { available: "12.5000", balance: "12.5000", enabled: true, frozen: null };

describe("the home page's balance box", () => {
  it("a visitor who is not signed in is invited to sign in", () => {
    expect(homeBalance(NOBODY)).toEqual({ kind: "signedOut" });
  });

  it("a customer sees the available balance and may add funds while the wallet is on", () => {
    expect(homeBalance({ ...NOBODY, customer: true, customerWallet: CUSTOMER_WALLET })).toEqual({
      kind: "balance",
      account: "customer",
      available: "12.5000",
      canAddFunds: true,
    });
  });

  it("a wallet that is switched off still shows what is left on it, without Add funds", () => {
    expect(homeBalance({ ...NOBODY, customer: true, customerWallet: { ...CUSTOMER_WALLET, enabled: false } })).toEqual({
      kind: "balance",
      account: "customer",
      available: "12.5000",
      canAddFunds: false,
    });
  });

  it("a wallet that is switched off and empty, or could not be read, shows no amount", () => {
    const off = { available: "0.0000", balance: "0.0000", enabled: false, frozen: null };
    expect(homeBalance({ ...NOBODY, customer: true, customerWallet: off })).toEqual({ kind: "noWallet", account: "customer" });
    expect(homeBalance({ ...NOBODY, customer: true })).toEqual({ kind: "noWallet", account: "customer" });
  });

  it("an approved merchant sees the merchant balance, also when a customer is signed in beside it", () => {
    const input = { merchant: { status: "active" as const }, merchantWallet: { available: "250.0000" }, customer: true, customerWallet: CUSTOMER_WALLET };
    expect(homeBalance(input)).toEqual({ kind: "balance", account: "merchant", available: "250.0000", canAddFunds: true });
  });

  it("a merchant waiting for approval has no balance: the customer's shows when there is one", () => {
    const pending = { merchant: { status: "pending" as const }, merchantWallet: null };
    expect(homeBalance({ ...NOBODY, ...pending })).toEqual({ kind: "noWallet", account: "merchant" });
    expect(homeBalance({ ...pending, customer: true, customerWallet: CUSTOMER_WALLET })).toMatchObject({ kind: "balance", account: "customer" });
  });
});
