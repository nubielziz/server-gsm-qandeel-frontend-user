import { describe, expect, it } from "vitest";
import { homeBalance, type HomeBalanceWallet } from "./home-balance";

const merchant = (available: string): HomeBalanceWallet => ({ kind: "merchant", read: { ok: true, data: { available } } });
const store = (
  over: { available?: string; balance?: string; enabled?: boolean; frozen?: { at: string } | null } = {},
): HomeBalanceWallet => ({
  kind: "store",
  read: { ok: true, data: { available: "12.5000", balance: "12.5000", enabled: true, frozen: null, ...over } },
});

describe("the home page's balance box", () => {
  it("a visitor who is not signed in is invited to sign in", () => {
    expect(homeBalance(null)).toEqual({ kind: "signedOut" });
  });

  it("a retail rank sees the available balance and may add funds while the wallet is on", () => {
    expect(homeBalance(store())).toEqual({ kind: "balance", available: "12.5000", canAddFunds: true });
  });

  it("a wallet that is switched off still shows what is left on it, without Add funds", () => {
    expect(homeBalance(store({ enabled: false }))).toEqual({ kind: "balance", available: "12.5000", canAddFunds: false });
  });

  it("a wallet that is switched off and empty shows no amount", () => {
    expect(homeBalance(store({ enabled: false, available: "0.0000", balance: "0.0000" }))).toEqual({ kind: "noWallet" });
  });

  it("a wallet that could not be read shows no amount, for either rank", () => {
    expect(homeBalance({ kind: "store", read: { ok: false } })).toEqual({ kind: "noWallet" });
    expect(homeBalance({ kind: "merchant", read: { ok: false } })).toEqual({ kind: "noWallet" });
  });

  it("a merchant rank sees its available amount, credit included as the API states it, and may always add funds", () => {
    expect(homeBalance(merchant("250.0000"))).toEqual({ kind: "balance", available: "250.0000", canAddFunds: true });
    expect(homeBalance(merchant("0.0000"))).toEqual({ kind: "balance", available: "0.0000", canAddFunds: true });
  });
});
