// The navigation of the one account frame, decided from the account's rank in pure functions (no React, no cookies), so the
// rules are unit-tested: which places the rail, the drawer and the phone tab bar offer, which title the header shows for a
// page the static list does not name, where the header search goes, which line sits under the name, and where the password
// gate sends an account. Every account has the same pages under `/account`; the rank only adds a place (a merchant rank's
// invoices) and decides whether the wallet is offered (always for a merchant rank, for a retail rank only while its store
// wallet shows). There is no price list: an account of a merchant rank buys in the shop like everybody, at its own prices
// (decision 003). The layout turns each entry into a link with an icon and, once the session is known, a live badge. The
// shop never links to the retired `/merchant` pages from here.
import { common } from "@/lib/i18n/messages/common";
import { portal } from "@/lib/i18n/messages/portal";
import { sitePath } from "@/lib/site-path";
import { walletCapabilities } from "@/lib/wallet/view";
import type { AccountCapabilities } from "./capabilities";
import type { AccountWalletRead } from "./wallet-read";

/** The places an account can have in the frame. */
export type AccountNavId = "overview" | "orders" | "wallet" | "invoices" | "notifications" | "support" | "settings";

/** One place of the frame: where it is and what it is called. The layout adds the icon and the live badge. */
export type AccountNavEntry = {
  readonly id: AccountNavId;
  /** Language-prefixed path. */
  readonly href: string;
  readonly label: string;
  /** A shorter name for the phone tab bar. */
  readonly shortLabel?: string;
  /** A longer page title for the header card. */
  readonly title?: string;
  /** Only the overview is "exact": every other place owns the pages below it. */
  readonly match?: "exact";
  /** Holds the place without showing it (the static shell's wallet slot, until the session says whether it shows). */
  readonly reserve?: true;
};

/** The three lists of the frame. */
export type AccountNavLists = {
  /** The rail and the drawer. */
  readonly nav: readonly AccountNavEntry[];
  /** Pinned to the bottom of the rail and the drawer. */
  readonly footerNav: readonly AccountNavEntry[];
  /** The phone tab bar. */
  readonly tabs: readonly AccountNavEntry[];
};

/** A page that has no place in the static list but needs its title in the header. */
export type AccountTitleEntry = Pick<AccountNavEntry, "href" | "label" | "title" | "match">;

/** The header search form. */
export type AccountSearch = { action: string; label: string; placeholder: string; submitLabel: string };

/** The tab bar has room for five columns on a 360px phone. */
export const MAX_TABS = 5;

const t = portal;

const ENTRIES: Record<AccountNavId, AccountNavEntry> = {
  overview: { id: "overview", href: sitePath("/account"), label: t.nav.overview, shortLabel: t.tabs.overview, match: "exact" },
  orders: { id: "orders", href: sitePath("/account/orders"), label: t.nav.orders, shortLabel: t.tabs.orders },
  wallet: { id: "wallet", href: sitePath("/account/wallet"), label: t.nav.wallet, shortLabel: t.tabs.wallet },
  invoices: { id: "invoices", href: sitePath("/account/invoices"), label: t.nav.invoices },
  notifications: {
    id: "notifications",
    href: sitePath("/account/notifications"),
    label: t.nav.notifications,
    shortLabel: t.tabs.notifications,
  },
  support: { id: "support", href: sitePath("/account/support"), label: t.nav.support, shortLabel: t.tabs.support },
  settings: { id: "settings", href: sitePath("/account/settings"), label: t.nav.settings },
};

/** A merchant rank's tab bar: the retail rank's places with its wallet (invoices stay in the rail and the drawer). */
const MERCHANT_TABS: readonly AccountNavId[] = ["overview", "orders", "wallet", "notifications", "support"];

/** What the lists are built from: the rank kind and the flag that opens the invoices. Any `AccountCapabilities` fits. */
export type NavCapabilities = Pick<AccountCapabilities, "rankKind" | "invoices">;

/**
 * The lists of the frame for one account.
 * - Retail rank: Overview, Orders, Wallet (only while the store wallet shows), Notifications, Support.
 * - Merchant rank: Overview, Orders, Wallet (always), Invoices, Notifications, Support.
 * - Footer: Settings.
 * - Phone tab bar: the retail rank's own list; a merchant rank's Overview, Orders, Wallet, Notifications and Support. Never
 *   more than `MAX_TABS`.
 * A rank this code does not know is retail (`capabilitiesOf` fails closed), so it never gets a merchant place.
 *
 * @param caps what the account may do (`capabilitiesOf(me)`)
 * @param storeWalletShown whether a retail rank's store wallet shows (`storeWalletShows(read)`); a merchant rank's wallet
 *   shows whatever this says
 */
export function accountNav(caps: NavCapabilities, storeWalletShown: boolean): AccountNavLists {
  const merchant = caps.rankKind === "merchant";
  const walletShown = merchant || storeWalletShown;
  const nav = [
    ENTRIES.overview,
    ENTRIES.orders,
    ...(walletShown ? [ENTRIES.wallet] : []),
    ...(caps.invoices ? [ENTRIES.invoices] : []),
    ENTRIES.notifications,
    ENTRIES.support,
  ];
  // The tab bar only ever holds places of the rail: the merchant rank's five, in their own order.
  const tabs = merchant ? MERCHANT_TABS.flatMap((id) => nav.filter((entry) => entry.id === id)) : nav;
  return { nav, footerNav: [ENTRIES.settings], tabs: tabs.slice(0, MAX_TABS) };
}

/** The retail rank's list, as the static shell draws it before the session is read: the wallet's place is held, not shown. */
const STATIC_CAPABILITIES: NavCapabilities = { rankKind: "retail", invoices: false };

/**
 * The lists the static shell draws before the session is read. Nothing personal is in them: the retail list, with the
 * wallet's place held (`reserve`), so the places below it do not move when the session's own lists swap in.
 */
export function staticAccountNav(): AccountNavLists {
  const hold = (list: readonly AccountNavEntry[]): AccountNavEntry[] =>
    list.map((entry) => (entry.id === "wallet" ? { ...entry, reserve: true as const } : entry));
  const lists = accountNav(STATIC_CAPABILITIES, true);
  return { nav: hold(lists.nav), footerNav: lists.footerNav, tabs: hold(lists.tabs) };
}

/**
 * The pages that are not in the static list but need their title in the static shell: the invoices (a merchant rank's place)
 * and the API keys page of its settings. They are never drawn as links.
 */
export function accountPageTitles(): AccountTitleEntry[] {
  return [
    { href: ENTRIES.invoices.href, label: ENTRIES.invoices.label },
    { href: sitePath("/account/settings/api-keys"), label: t.apiKeysTitle },
  ];
}

/** Whether a retail rank's store wallet shows (a nav item, a header pill): the shop switch is on, or a balance is left. */
export function storeWalletShows(wallet: AccountWalletRead | null): boolean {
  return wallet?.kind === "store" && wallet.read.ok && walletCapabilities(wallet.read.data).show;
}

/** The header search: every account searches the shop's services (a merchant rank sees its own prices there, decision 003). */
export function accountSearch(): AccountSearch {
  return {
    action: sitePath("/services"),
    label: t.searchServices,
    placeholder: t.searchServices,
    submitLabel: common.actions.search,
  };
}

/** The small line under the name in the account menu: the company when there is one, else the name of the rank. */
export function accountSubtitle(me: { company?: string | null; rank?: { name?: string | null } | null }): string {
  return me.company?.trim() || me.rank?.name?.trim() || t.accountRole;
}

/**
 * Where the password gate sends an account that still has a temporary password: the security page of the settings, the one
 * page every account has for changing its password.
 */
export function securityPageHref(): string {
  return sitePath("/account/settings/security");
}
