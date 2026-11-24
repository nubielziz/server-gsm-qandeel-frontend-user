// What an account may do, decided from its rank in one pure function. Pages and menus ask here instead of comparing rank
// names, so a rank kind that is new or unknown never opens a merchant-only door: it gets the retail answer.
// Pure, no imports beyond the family file. The backend refuses every one of these again on the server; this only
// decides what the shop offers.
import { familyOf, rankKindOf, type AccountFamily, type RankKind, type RankSource } from "./family";

/** The part of an account answer the capabilities read: the rank and whether the account has a password. */
export type CapabilitySource = RankSource & { hasPassword?: boolean | null };

/** What the shop offers one account. Every flag is false for a visitor who is not signed in. */
export type AccountCapabilities = {
  readonly rankKind: RankKind;
  readonly family: AccountFamily;
  /** Invoices, which are how a merchant rank adds funds (merchant rank only). */
  readonly invoices: boolean;
  /** API keys for the Dhru address (merchant rank only). */
  readonly apiKeys: boolean;
  /** The notification switches of the portal (merchant rank only). */
  readonly notificationPreferences: boolean;
  /** Two-step sign-in: only an account that has a password can turn it on, whatever its rank. */
  readonly twoStep: boolean;
  /** Asking for a copy of the account's data: every signed-in account. */
  readonly dataExport: boolean;
  /** Asking for the account to be erased: the retail rank only. A merchant rank asks the team to move it first. */
  readonly dataErasure: boolean;
};

/**
 * The capabilities of an account, by rank. Retail: no invoices, no API keys, no notification switches; merchant: all three.
 * There is no price list: every rank buys in the shop, a merchant rank at its own prices (decision 003). Two-step needs a
 * password (`hasPassword === true`: an unknown value counts as no password). Data export is open to every signed-in account
 * and erasure to the retail rank only. Fails closed like `rankKindOf`; null (signed out) can do nothing.
 */
export function capabilitiesOf(me: CapabilitySource | null | undefined): AccountCapabilities {
  const rankKind = rankKindOf(me);
  const family = familyOf(me);
  if (!me) {
    return {
      rankKind,
      family,
      invoices: false,
      apiKeys: false,
      notificationPreferences: false,
      twoStep: false,
      dataExport: false,
      dataErasure: false,
    };
  }
  const merchant = rankKind === "merchant";
  return {
    rankKind,
    family,
    invoices: merchant,
    apiKeys: merchant,
    notificationPreferences: merchant,
    twoStep: me.hasPassword === true,
    dataExport: true,
    dataErasure: !merchant,
  };
}
