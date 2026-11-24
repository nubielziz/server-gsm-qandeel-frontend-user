// The header's choices for a signed-in account: the rows of the avatar menu, when the wallet row shows, and whether the
// currency choice is kept on the account.
import { describe, expect, it } from "vitest";
import {
  accountMenuItems,
  savesCurrencyToAccount,
  walletRowShows,
  type AccountMenuRow,
  type MenuWalletRead,
} from "./account-menu";

const RETAIL = { rank: { kind: "retail" } };
const MERCHANT = { rank: { kind: "merchant" } };

const ids = (rows: AccountMenuRow[]) => rows.map((row) => row.id);
// One menu for every rank: the rank only decides whether the wallet row shows (`walletRowShows`), so `me` reads nothing here.
const rowsFor = (_me: unknown, walletShows: boolean) => accountMenuItems(walletShows);

const storeWallet = (over: { enabled?: boolean; balance?: string; frozen?: { at: string } | null } = {}): MenuWalletRead => ({
  kind: "store",
  read: { ok: true, data: { enabled: true, balance: "0.0000", frozen: null, ...over } },
});

describe("accountMenuItems", () => {
  it("a retail rank has My account, Orders, Wallet while it shows, Settings and then one Sign out", () => {
    expect(ids(rowsFor(RETAIL, true))).toEqual(["account", "orders", "wallet", "settings", "signOut"]);
    expect(ids(rowsFor(RETAIL, false))).toEqual(["account", "orders", "settings", "signOut"]);
  });

  it("a merchant rank has the same rows: no price list (it sees its own prices in the shop, decision 003)", () => {
    expect(ids(rowsFor(MERCHANT, walletRowShows(MERCHANT, null)))).toEqual(["account", "orders", "wallet", "settings", "signOut"]);
  });

  it("there is exactly one Sign out, and it is the last row, whatever the rank", () => {
    for (const me of [RETAIL, MERCHANT]) {
      for (const walletShows of [true, false]) {
        const rows = rowsFor(me, walletShows);
        expect(rows.filter((row) => row.id === "signOut")).toHaveLength(1);
        expect(rows.at(-1)).toEqual({ id: "signOut" });
      }
    }
  });

  it("no row leads into a separate merchant area: every page is an address of the one account area", () => {
    const paths = [RETAIL, MERCHANT].flatMap((me) => rowsFor(me, true)).flatMap((row) => ("path" in row ? [row.path] : []));
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path === "/account" || path.startsWith("/account/"), path).toBe(true);
      expect(path).not.toContain("merchant");
    }
  });

  it("the rows go to the pages the account area has", () => {
    const byId = Object.fromEntries(rowsFor(MERCHANT, true).flatMap((row) => ("path" in row ? [[row.id, row.path]] : [])));
    expect(byId).toEqual({
      account: "/account",
      orders: "/account/orders",
      wallet: "/account/wallet",
      settings: "/account/settings",
    });
  });
});

describe("walletRowShows", () => {
  it("a merchant rank always has its wallet page, even before the wallet is read", () => {
    expect(walletRowShows(MERCHANT, null)).toBe(true);
    expect(walletRowShows(MERCHANT, { kind: "merchant" })).toBe(true);
  });

  it("a retail rank has the row while the store balance is switched on, or a balance is left", () => {
    expect(walletRowShows(RETAIL, storeWallet({ enabled: true }))).toBe(true);
    expect(walletRowShows(RETAIL, storeWallet({ enabled: false, balance: "5.0000" }))).toBe(true);
  });

  it("a retail rank has no row for a switched-off empty wallet, a wallet that could not be read, or no read at all", () => {
    expect(walletRowShows(RETAIL, storeWallet({ enabled: false, balance: "0.0000" }))).toBe(false);
    expect(walletRowShows(RETAIL, { kind: "store", read: { ok: false } })).toBe(false);
    expect(walletRowShows(RETAIL, null)).toBe(false);
  });

  it("a visitor who is signed out has no row", () => {
    expect(walletRowShows(null, null)).toBe(false);
  });
});

describe("savesCurrencyToAccount", () => {
  it("only a retail rank keeps the currency choice on the account", () => {
    expect(savesCurrencyToAccount(RETAIL)).toBe(true);
    expect(savesCurrencyToAccount(MERCHANT)).toBe(false);
  });

  it("a visitor keeps it in the cookie alone, and an unknown rank kind counts as retail", () => {
    expect(savesCurrencyToAccount(null)).toBe(false);
    expect(savesCurrencyToAccount({ rank: { kind: "wholesale" } })).toBe(true);
  });
});
