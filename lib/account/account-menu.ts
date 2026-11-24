// What the shop header offers a signed-in account, decided from its rank in pure functions: the rows of the avatar menu, and
// whether the currency picker keeps its choice on the account. One account type has one menu: a rank only adds or drops a
// row (the price list is a merchant rank's), it never swaps the whole menu, and there is one sign-out row for every account.
// Pure: the header component draws what this says. The backend refuses every door again on the server.
import type { AccountCapabilities } from "./capabilities";
import { familyOf, rankKindOf, type RankSource } from "./family";
import { walletCapabilities, type WalletState } from "@/lib/wallet/view";

/** A row of the avatar menu that goes to a page of the account area. */
export type AccountMenuLink = {
  id: "account" | "orders" | "wallet" | "priceList" | "settings";
  /** A path of this site without the language folder; the component wraps it in `sitePath`. */
  path: string;
};

/** The row that ends the session. It has no page: the button posts to the one sign-out route. */
export type AccountMenuSignOut = { id: "signOut" };

export type AccountMenuRow = AccountMenuLink | AccountMenuSignOut;

const PATHS = {
  account: "/account",
  orders: "/account/orders",
  wallet: "/account/wallet",
  priceList: "/account/services",
  settings: "/account/settings",
} as const satisfies Record<AccountMenuLink["id"], string>;

/**
 * The rows of the avatar menu, top to bottom: My account, Orders, Wallet (only when `walletShows`), Price list (only for an
 * account whose rank has one), Settings, then exactly one Sign out. Every page is an address of the one account area: no
 * row leads into a separate merchant area, and no row says "merchant portal".
 *
 * @param capabilities what the rank offers (`capabilitiesOf(me)`); only the price list is read
 * @param walletShows whether the wallet row is offered (`walletRowShows`)
 */
export function accountMenuItems(capabilities: Pick<AccountCapabilities, "priceList">, walletShows: boolean): AccountMenuRow[] {
  const link = (id: AccountMenuLink["id"]): AccountMenuLink => ({ id, path: PATHS[id] });
  return [
    link("account"),
    link("orders"),
    ...(walletShows ? [link("wallet")] : []),
    ...(capabilities.priceList ? [link("priceList")] : []),
    link("settings"),
    { id: "signOut" },
  ];
}

/** The part of the account's wallet read the menu looks at: the kind of wallet, and what a retail rank's read found. */
export type MenuWalletRead = { kind: "merchant" } | { kind: "store"; read: { ok: true; data: WalletState } | { ok: false } };

/**
 * Whether the menu has a Wallet row. A merchant rank always has its wallet page. A retail rank has one only while its store
 * balance shows (the shop switch is on, or a balance is left); a wallet that was not read, or could not be read, gives no
 * row, so the header never breaks on it.
 */
export function walletRowShows(me: RankSource | null, wallet: MenuWalletRead | null): boolean {
  if (!me) return false;
  if (rankKindOf(me) === "merchant") return true;
  return wallet?.kind === "store" && wallet.read.ok && walletCapabilities(wallet.read.data).show;
}

/**
 * Whether the currency picker keeps the visitor's choice on the account (`PATCH` of the profile). Only a signed-in retail
 * rank has a currency to keep there; a merchant rank and a visitor keep the choice in the cookie alone.
 */
export function savesCurrencyToAccount(me: RankSource | null): boolean {
  return me !== null && familyOf(me) === "store";
}
