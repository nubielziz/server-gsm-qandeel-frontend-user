// The personal price layer of the shop (decision 003). The shop's pages, their HTML and every public read stay cached, shared
// and priced for retail; on top of them, in the browser only, an account of a merchant rank sees its own price in each place
// the shop draws the price of a service. This file is the layer's state, without React:
// - who the visitor is: the readable CSRF cookie of the portal family (lib/api/account-cookie.ts) is the only sign that a
//   session of a merchant rank may exist. Without it every slot is "public" at once: a guest and a retail account read nothing, wait for
//   nothing and never see a placeholder. With it, `GET /client/auth/me` says whether the rank is a merchant one (the cookie outlives
//   a session the server has ended): when the answer is "nobody is signed in" or "not a merchant rank", the slots show the public
//   prices at once and the rule that hides them is lifted (`liftOwnPricesGuard`);
// - the own prices of the services on the page: each slot asks for its service id, and the ids asked for within one tick are
//   read together, at most 100 a request, from `GET /client/services?ids=…`. That read is personal (`no-store`, never put in
//   anything cached or shared), and the API remembers every price it shows, so the price-change guard of an order keeps working.
// The React side (the layer mounted in the shop layout, the hook and the slots) is components/store/own-price.tsx.
import { rankKindOf, type RankSource } from "@/lib/account/family";
import { ACCOUNT_CSRF_COOKIES, accountCsrfFrom, accountFamilyFromCookies } from "@/lib/api/account-cookie";
import { isApiError } from "@/lib/api/errors";
import type { MerchantService } from "@/lib/api/types";

/**
 * What one price slot shows:
 * - `early`: the page as the server drew it, before the browser has looked at the session (a server page's first render and its
 *   hydration): the public price, marked with `RETAIL_PRICE_ATTRIBUTE` so that `OWN_PRICES_GUARD` keeps it hidden from a
 *   browser that holds a merchant session;
 * - `public`: a visitor without a merchant session: the public price as the page drew it;
 * - `pending`: an account of a merchant rank, or one that may be until the API has answered: a neutral placeholder;
 * - `own`: the account's own price, in the currency of its wallet, without tax;
 * - `unavailable`: the account may not buy the service, or has no price for it: "Not available for your account", buying is off;
 * - `failed`: the read failed: no price at all (never the public one), buying stays on (the order form reads the price again).
 */
export type OwnPriceState =
  | { readonly kind: "early" }
  | { readonly kind: "public" }
  | { readonly kind: "pending" }
  | { readonly kind: "own"; readonly price: string; readonly currency: string }
  | { readonly kind: "unavailable" }
  | { readonly kind: "failed" };

export const EARLY: OwnPriceState = Object.freeze({ kind: "early" });
export const PUBLIC: OwnPriceState = Object.freeze({ kind: "public" });
export const PENDING: OwnPriceState = Object.freeze({ kind: "pending" });
export const UNAVAILABLE: OwnPriceState = Object.freeze({ kind: "unavailable" });
export const FAILED: OwnPriceState = Object.freeze({ kind: "failed" });

/**
 * Who the prices of a page are for, for the parts that show a price of many services (the lowest price of the catalog, the
 * lowest of a collection): `early` before the browser has looked, `public` for a visitor without a merchant session, `personal`
 * for an account of a merchant rank (or one that may be).
 */
export type OwnPriceVisitor = "early" | "public" | "personal";

/** The most ids one read may carry (the route refuses more). */
export const MAX_IDS_PER_READ = 100;
/** How long an own price is shown before a page that shows it again reads it again. */
export const OWN_PRICE_TTL_MS = 5 * 60_000;
/** How long after a failed read a page that shows the price may try again. */
export const RETRY_AFTER_MS = 10_000;

/**
 * The attribute the guard script sets on `<html>` when the browser holds a merchant session (see app/globals.css). It is taken off
 * again (`liftOwnPricesGuard`) when the account read says the cookie is a leftover.
 */
export const OWN_PRICES_ATTRIBUTE = "data-own-prices";
/** The attribute that marks a public price the server drew, while the page is not live yet (see app/globals.css). */
export const RETAIL_PRICE_ATTRIBUTE = "data-retail-price";

/**
 * The script the root layout runs while the HTML is read, before anything is painted: when a merchant session's cookie is
 * there, it marks `<html>`, and app/globals.css then hides every public price the server drew (`RETAIL_PRICE_ATTRIBUTE`)
 * until the page is live and the slots show the account's own prices. A merchant never sees a retail price as its own, not even
 * before hydration; a guest and a retail account have no such cookie and see the page exactly as drawn.
 */
export const OWN_PRICES_GUARD =
  `(function(){try{if(/(?:^|;\\s*)${ACCOUNT_CSRF_COOKIES[0]}=[^;\\s]/.test(document.cookie))` +
  `document.documentElement.setAttribute("${OWN_PRICES_ATTRIBUTE}","")}catch(e){}})()`;

/**
 * Lifts the rule that hides the public prices the server drew (see `OWN_PRICES_ATTRIBUTE`): the account read said the browser's
 * cookie is a leftover of an ended session, or of an account that is not a merchant rank. Safe to run again.
 *
 * @param root the page's `<html>` element
 */
export function liftOwnPricesGuard(root: Pick<Element, "removeAttribute">): void {
  root.removeAttribute(OWN_PRICES_ATTRIBUTE);
}

/**
 * Whether a failed account read (`GET /client/auth/me`) means "this visitor is not a merchant rank": 401 (nobody is signed in) or
 * 403 (a rank the portal routes refuse). Any other failure (the network, a server error) does not tell, and shows no price.
 */
export function isNotMerchantAnswer(error: unknown): boolean {
  return isApiError(error) && (error.status === 401 || error.status === 403);
}

/**
 * The query of one read of own prices. `ids` is the parameter `GET /client/services` takes for this layer (a comma-separated list of
 * at most 100 service ids); the generated query type has it too (`GetClientServicesQuery`), and this is the exact query the layer sends.
 * `_start`/`_end` ask for one row per id (the list's default page holds 25).
 */
export type OwnPricesQuery = { readonly ids: string; readonly _start: 0; readonly _end: number };

/** The part of a row of `GET /client/services` the layer reads. */
export type OwnPriceRow = Pick<MerchantService, "id" | "price" | "currency">;

/** A service id the API can hold: a positive whole number. */
export function isServiceId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

/** The ids to read, each once, smallest first, in groups of at most `MAX_IDS_PER_READ`. Anything that is not a service id is left out. */
export function idBatches(ids: Iterable<number>): number[][] {
  const unique = [...new Set([...ids].filter(isServiceId))].sort((a, b) => a - b);
  const batches: number[][] = [];
  for (let at = 0; at < unique.length; at += MAX_IDS_PER_READ) batches.push(unique.slice(at, at + MAX_IDS_PER_READ));
  return batches;
}

/** The query of one batch (`idBatches`): `?ids=3,7,12&_start=0&_end=3`. */
export function ownPricesQuery(batch: readonly number[]): OwnPricesQuery {
  return { ids: batch.join(","), _start: 0, _end: Math.max(1, batch.length) };
}

const MONEY = /^\d+(\.\d+)?$/;

/**
 * What each id of a batch shows, from the rows the API answered: its own price when its row has a money string and a currency;
 * "not available" when the API left it out (a service the account may not buy) or sent no price for it.
 */
export function statesFromRows(batch: readonly number[], rows: readonly OwnPriceRow[]): Map<number, OwnPriceState> {
  const byId = new Map(rows.filter((row) => row && isServiceId(row.id)).map((row) => [row.id, row]));
  const states = new Map<number, OwnPriceState>();
  for (const id of batch) {
    const row = byId.get(id);
    const priced = row && typeof row.price === "string" && MONEY.test(row.price) && typeof row.currency === "string" && row.currency;
    states.set(id, priced ? Object.freeze({ kind: "own", price: row.price, currency: row.currency }) : UNAVAILABLE);
  }
  return states;
}

/**
 * The session a merchant's prices belong to: the value of the portal family's CSRF cookie (one per session), or undefined when
 * the browser has none (a guest, a retail account). A new value means another session: the prices read before are forgotten.
 *
 * @param cookies the cookie header (`document.cookie`)
 */
export function merchantSessionKey(cookies: string): string | undefined {
  return accountFamilyFromCookies(cookies) === "client" ? accountCsrfFrom(cookies) : undefined;
}

/** How the store reaches the browser and the API (the browser client in the app, stand-ins in tests). */
export type OwnPriceReaders = {
  /** The cookie header of the page (`document.cookie`). */
  readonly cookies: () => string;
  /** Reads the signed-in account (`GET /client/auth/me`): null when the API says nobody is signed in or the rank is refused; throws when it cannot tell. */
  readonly me: () => Promise<RankSource | null>;
  /** Runs when the account read has said the visitor is not signed in or has no merchant rank (a leftover cookie): lifts the rule that hides the public prices. */
  readonly notMerchant?: () => void;
  /** Reads the own prices of one batch (`GET /client/services` with `ids`). */
  readonly prices: (query: OwnPricesQuery) => Promise<readonly OwnPriceRow[]>;
  readonly now?: () => number;
  /** Runs the reads once the slots of one render have asked (default: the next task). */
  readonly schedule?: (run: () => void) => void;
};

type Rank = "unknown" | "merchant" | "other" | "failed";

type Entry = { readonly state: OwnPriceState; readonly at: number };

/**
 * The state of the layer for one browser tab. `price` and `visitor` only read (they are the snapshots of
 * `useSyncExternalStore`); `want` starts the reads a slot needs. Nothing is read without a merchant session's cookie.
 */
export class OwnPriceStore {
  private session: string | undefined;
  private rank: Rank = "unknown";
  private rankAt = 0;
  private rankRead: Promise<void> | null = null;
  private readonly entries = new Map<number, Entry>();
  /** The ids on the page now, with how many slots show each. */
  private readonly wanted = new Map<number, number>();
  private readonly reading = new Set<number>();
  private queued = false;
  private readonly listeners = new Set<() => void>();
  private readonly readers: OwnPriceReaders;

  constructor(readers: OwnPriceReaders) {
    this.readers = readers;
  }

  /** Adds a listener that runs whenever a slot may show something else; returns its removal. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** What the slot of service `id` shows now. Reads the cookie and the state, changes nothing. */
  readonly price = (id: number): OwnPriceState => {
    const key = this.key();
    if (!key) return PUBLIC;
    if (key !== this.session) return PENDING;
    if (this.rank === "other") return PUBLIC;
    if (this.rank === "failed") return FAILED;
    return this.entries.get(id)?.state ?? PENDING;
  };

  /** Who the page's prices are for now (`public` or `personal`, see `OwnPriceVisitor`). Changes nothing. */
  readonly visitor = (): OwnPriceVisitor => {
    const key = this.key();
    if (!key) return "public";
    if (key !== this.session) return "personal";
    return this.rank === "other" ? "public" : "personal";
  };

  /**
   * A slot shows service `id` (without an id: a part that only needs to know the visitor). Starts what is missing: the rank of a
   * new session, then the prices that were never read or are old. Returns the function that says the slot is gone.
   */
  want(id?: number): () => void {
    const counted = isServiceId(id);
    if (counted) this.wanted.set(id, (this.wanted.get(id) ?? 0) + 1);
    this.sync();
    let released = false;
    return () => {
      if (!counted || released) return;
      released = true;
      const left = (this.wanted.get(id) ?? 1) - 1;
      if (left > 0) this.wanted.set(id, left);
      else this.wanted.delete(id);
    };
  }

  private now(): number {
    return this.readers.now ? this.readers.now() : Date.now();
  }

  private key(): string | undefined {
    return merchantSessionKey(this.readers.cookies());
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }

  /** A new session (another account, or signed in again): nothing read for the last one is kept. */
  private reset(key: string): void {
    this.session = key;
    this.rank = "unknown";
    this.rankAt = 0;
    this.rankRead = null;
    this.entries.clear();
    this.reading.clear();
  }

  /** The ids on the page whose price was never read, is old, or failed a while ago, and is not being read. */
  private stale(): number[] {
    const now = this.now();
    return [...this.wanted.keys()].filter((id) => {
      if (this.reading.has(id)) return false;
      const entry = this.entries.get(id);
      if (!entry) return true;
      return now - entry.at >= (entry.state.kind === "failed" ? RETRY_AFTER_MS : OWN_PRICE_TTL_MS);
    });
  }

  private sync(): void {
    const key = this.key();
    if (!key) return;
    if (key !== this.session) this.reset(key);
    if (this.rank === "other" || this.queued) return;
    if (this.rank === "failed" && this.now() - this.rankAt < RETRY_AFTER_MS) return;
    if (this.rank === "merchant" && this.stale().length === 0) return;
    this.queued = true;
    const schedule = this.readers.schedule ?? ((run: () => void) => void setTimeout(run, 0));
    schedule(() => void this.flush());
  }

  private async flush(): Promise<void> {
    this.queued = false;
    const session = this.session;
    if (!session) return;
    if (this.rank !== "merchant") await this.readRank(session);
    if (session !== this.session || this.rank !== "merchant") return;
    const ids = this.stale();
    for (const id of ids) this.reading.add(id);
    await Promise.all(idBatches(ids).map((batch) => this.readPrices(session, batch)));
  }

  private readRank(session: string): Promise<void> {
    this.rankRead ??= this.readers.me().then(
      (me) => this.settleRank(session, me && rankKindOf(me) === "merchant" ? "merchant" : "other"),
      () => this.settleRank(session, "failed"),
    );
    return this.rankRead;
  }

  private settleRank(session: string, rank: Rank): void {
    if (session !== this.session) return;
    this.rank = rank;
    this.rankAt = this.now();
    this.rankRead = null;
    if (rank === "other") this.readers.notMerchant?.();
    this.emit();
  }

  private async readPrices(session: string, batch: number[]): Promise<void> {
    let states: Map<number, OwnPriceState> | null = null;
    try {
      states = statesFromRows(batch, await this.readers.prices(ownPricesQuery(batch)));
    } catch {
      states = null;
    }
    if (session !== this.session) return;
    const at = this.now();
    for (const id of batch) {
      this.reading.delete(id);
      const next = states?.get(id);
      // A failed read leaves a price already shown (it is still the account's own, only older); a first read shows no price.
      if (next) this.entries.set(id, { state: next, at });
      else if (!this.entries.has(id) || this.entries.get(id)!.state.kind === "failed") this.entries.set(id, { state: FAILED, at });
    }
    this.emit();
  }
}
