// The personal price layer's state (decision 003): a guest and a retail account read nothing and see the public price at once; an
// account of a merchant rank sees a placeholder, then its own price, read for every service of the page in one call; a service
// it may not buy is "not available"; nothing read for one session is shown to another.
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  EARLY,
  FAILED,
  MAX_IDS_PER_READ,
  OWN_PRICES_ATTRIBUTE,
  OWN_PRICES_GUARD,
  OWN_PRICE_TTL_MS,
  OwnPriceStore,
  PENDING,
  PUBLIC,
  RETRY_AFTER_MS,
  UNAVAILABLE,
  idBatches,
  isNotMerchantAnswer,
  liftOwnPricesGuard,
  merchantSessionKey,
  ownPricesQuery,
  statesFromRows,
  type OwnPriceRow,
  type OwnPricesQuery,
} from "./own-prices";

const MERCHANT_COOKIE = "csrf_token_client=tok-1";
const RETAIL_COOKIE = "csrf_token_store=tok-r";
const MERCHANT = { rank: { kind: "merchant" } };

/** A store with stand-in readers: the reads are recorded, a scheduled run waits until `settle()`. */
function setup(options: { cookies?: string; me?: () => Promise<unknown>; rows?: (query: OwnPricesQuery) => OwnPriceRow[] | Promise<OwnPriceRow[]> } = {}) {
  const state = { cookies: options.cookies ?? MERCHANT_COOKIE, now: 1_000_000 };
  const runs: (() => void)[] = [];
  const me = vi.fn(options.me ?? (async () => MERCHANT));
  const lift = vi.fn();
  const prices = vi.fn(async (query: OwnPricesQuery) =>
    options.rows
      ? options.rows(query)
      : query.ids.split(",").map((id) => ({ id: Number(id), price: `${id}.5000`, currency: "USD" })),
  );
  const store = new OwnPriceStore({
    cookies: () => state.cookies,
    me: me as never,
    notMerchant: lift,
    prices,
    now: () => state.now,
    schedule: (run) => void runs.push(run),
  });
  /** Runs what was scheduled and lets every read answer. */
  async function settle() {
    for (let round = 0; round < 5; round++) {
      while (runs.length) runs.shift()!();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return { store, state, me, prices, lift, settle };
}

describe("a guest and a retail account", () => {
  for (const [who, cookies] of [
    ["a guest", ""],
    ["a retail account", RETAIL_COOKIE],
    ["a browser with unrelated cookies", "theme=dark; gsm_currency=EUR"],
  ] as const) {
    it(`${who}: the public price at once, no read, no placeholder, no wait`, async () => {
      const { store, me, prices, settle } = setup({ cookies });
      expect(store.price(7)).toBe(PUBLIC);
      store.want(7);
      store.want();
      expect(store.price(7)).toBe(PUBLIC);
      expect(store.visitor()).toBe("public");
      await settle();
      expect(me).not.toHaveBeenCalled();
      expect(prices).not.toHaveBeenCalled();
      expect(store.price(7)).toBe(PUBLIC);
    });
  }
});

describe("an account of a merchant rank", () => {
  it("sees a placeholder, never the public price, until its own price is there", async () => {
    const { store, settle } = setup();
    expect(store.price(7)).toBe(PENDING);
    store.want(7);
    expect(store.price(7)).toBe(PENDING);
    expect(store.visitor()).toBe("personal");
    await settle();
    expect(store.price(7)).toEqual({ kind: "own", price: "7.5000", currency: "USD" });
    expect(store.visitor()).toBe("personal");
  });

  it("reads the prices of every slot of the page in one call, each id once, after one rank read", async () => {
    const { store, me, prices, settle } = setup();
    for (const id of [12, 3, 7, 3, 12]) store.want(id);
    await settle();
    expect(me).toHaveBeenCalledTimes(1);
    expect(prices).toHaveBeenCalledTimes(1);
    expect(prices).toHaveBeenCalledWith({ ids: "3,7,12", _start: 0, _end: 3 });
  });

  it("reads at most 100 ids a call", async () => {
    const { store, prices, settle } = setup();
    for (let id = 1; id <= 150; id++) store.want(id);
    await settle();
    expect(prices).toHaveBeenCalledTimes(2);
    expect(prices.mock.calls[0][0].ids.split(",")).toHaveLength(MAX_IDS_PER_READ);
    expect(prices.mock.calls[1][0]).toMatchObject({ _start: 0, _end: 50 });
    expect(store.price(150)).toMatchObject({ kind: "own" });
  });

  it("reads a price once: another slot of the same service, or the next page that shows it, costs no call", async () => {
    const { store, prices, settle } = setup();
    store.want(7);
    await settle();
    store.want(7);
    store.want(7);
    await settle();
    expect(prices).toHaveBeenCalledTimes(1);
  });

  it("reads only the services the next page adds", async () => {
    const { store, prices, settle } = setup();
    store.want(7);
    await settle();
    store.want(7);
    store.want(9);
    await settle();
    expect(prices).toHaveBeenLastCalledWith({ ids: "9", _start: 0, _end: 1 });
  });

  it("reads an old price again when a page shows it after the time to live, and keeps showing it meanwhile", async () => {
    const { store, state, prices, settle } = setup();
    store.want(7);
    await settle();
    state.now += OWN_PRICE_TTL_MS - 1;
    store.want(7);
    await settle();
    expect(prices).toHaveBeenCalledTimes(1);
    state.now += 1;
    store.want(7);
    expect(store.price(7)).toMatchObject({ kind: "own" });
    await settle();
    expect(prices).toHaveBeenCalledTimes(2);
  });

  it('says "not available" for a service the API left out (not sold to the account) and one without a price', async () => {
    const { store, settle } = setup({
      rows: () => [
        { id: 3, price: "1.2000", currency: "USD" },
        { id: 5, price: "", currency: "USD" },
      ],
    });
    for (const id of [3, 4, 5]) store.want(id);
    await settle();
    expect(store.price(3)).toEqual({ kind: "own", price: "1.2000", currency: "USD" });
    expect(store.price(4)).toBe(UNAVAILABLE);
    expect(store.price(5)).toBe(UNAVAILABLE);
  });

  it("shows no price at all when the read fails (never the public one), and tries again a while later", async () => {
    let fail = true;
    const { store, state, prices, settle } = setup({
      rows: (query) => {
        if (fail) throw new Error("down");
        return [{ id: Number(query.ids), price: "2.0000", currency: "USD" }];
      },
    });
    store.want(7);
    await settle();
    expect(store.price(7)).toBe(FAILED);
    fail = false;
    store.want(7);
    await settle();
    expect(prices).toHaveBeenCalledTimes(1);
    state.now += RETRY_AFTER_MS;
    store.want(7);
    await settle();
    expect(store.price(7)).toEqual({ kind: "own", price: "2.0000", currency: "USD" });
  });

  it("keeps a price already shown when a later read fails", async () => {
    let fail = false;
    const { store, state, settle } = setup({
      rows: (query) => {
        if (fail) throw new Error("down");
        return [{ id: Number(query.ids), price: "2.0000", currency: "USD" }];
      },
    });
    store.want(7);
    await settle();
    fail = true;
    state.now += OWN_PRICE_TTL_MS;
    store.want(7);
    await settle();
    expect(store.price(7)).toEqual({ kind: "own", price: "2.0000", currency: "USD" });
  });

  it("tells every listener when its prices are there", async () => {
    const { store, settle } = setup();
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    store.want(7);
    await settle();
    expect(listener).toHaveBeenCalled();
    stop();
    listener.mockClear();
    store.want(8);
    await settle();
    expect(listener).not.toHaveBeenCalled();
  });

  it("a part that only needs the visitor (no id) reads the rank and no price", async () => {
    const { store, me, prices, settle } = setup();
    store.want();
    await settle();
    expect(me).toHaveBeenCalledTimes(1);
    expect(prices).not.toHaveBeenCalled();
    expect(store.visitor()).toBe("personal");
  });

  it("a slot that left the page is not read again", async () => {
    const { store, state, prices, settle } = setup();
    const release = store.want(7);
    await settle();
    release();
    release();
    state.now += OWN_PRICE_TTL_MS;
    store.want(9);
    await settle();
    expect(prices).toHaveBeenLastCalledWith({ ids: "9", _start: 0, _end: 1 });
  });
});

describe("a browser whose portal cookie is not a merchant session", () => {
  it("the API says the rank is not a merchant one: the public price, and no price read", async () => {
    const { store, prices, settle } = setup({ me: async () => ({ rank: { kind: "retail" } }) });
    store.want(7);
    expect(store.price(7)).toBe(PENDING);
    await settle();
    expect(store.price(7)).toBe(PUBLIC);
    expect(store.visitor()).toBe("public");
    expect(prices).not.toHaveBeenCalled();
  });

  it("signed out or refused (the reader answers null), or a rank kind this code does not know: the public price", async () => {
    for (const answer of [null, { rank: { kind: "wholesale" } }, {}]) {
      const { store, prices, settle } = setup({ me: async () => answer });
      store.want(7);
      await settle();
      expect(store.price(7), JSON.stringify(answer)).toBe(PUBLIC);
      expect(prices).not.toHaveBeenCalled();
    }
  });

  it("a leftover cookie of an ended session: the public price and the lifted hiding rule as soon as the read answers, never a placeholder after", async () => {
    // The API answers 401 to the account read; the reader of the app turns that into null (`isNotMerchantAnswer`).
    for (const answer of [null, { rank: { kind: "retail" } }]) {
      const { store, prices, lift, settle } = setup({ me: async () => answer });
      store.want(7);
      store.want(8);
      store.want();
      expect(store.price(7), "until the read answers").toBe(PENDING);
      expect(lift).not.toHaveBeenCalled();
      await settle();
      expect(lift).toHaveBeenCalledTimes(1);
      for (const id of [7, 8]) expect(store.price(id)).toBe(PUBLIC);
      expect(store.visitor()).toBe("public");
      store.want(9);
      await settle();
      expect(store.price(9)).toBe(PUBLIC);
      expect(lift).toHaveBeenCalledTimes(1);
      expect(prices).not.toHaveBeenCalled();
    }
  });

  it("lifts nothing for a merchant session, for a read that cannot tell, or for a browser that never had the cookie", async () => {
    const merchant = setup();
    merchant.store.want(7);
    await merchant.settle();
    expect(merchant.lift).not.toHaveBeenCalled();

    const unreadable = setup({
      me: async () => {
        throw new Error("down");
      },
    });
    unreadable.store.want(7);
    await unreadable.settle();
    expect(unreadable.store.price(7)).toBe(FAILED);
    expect(unreadable.lift).not.toHaveBeenCalled();

    const guest = setup({ cookies: "" });
    guest.store.want(7);
    await guest.settle();
    expect(guest.lift).not.toHaveBeenCalled();
  });

  it("the rank cannot be read: no price at all, and another try a while later", async () => {
    let fail = true;
    const { store, state, me, settle } = setup({
      me: async () => {
        if (fail) throw new Error("down");
        return MERCHANT;
      },
    });
    store.want(7);
    await settle();
    expect(store.price(7)).toBe(FAILED);
    expect(store.visitor()).toBe("personal");
    fail = false;
    store.want(7);
    await settle();
    expect(me).toHaveBeenCalledTimes(1);
    state.now += RETRY_AFTER_MS;
    store.want(7);
    await settle();
    expect(store.price(7)).toMatchObject({ kind: "own" });
  });
});

describe("sessions", () => {
  it("signing out shows the public price at once", async () => {
    const { store, state, settle } = setup();
    store.want(7);
    await settle();
    state.cookies = "";
    expect(store.price(7)).toBe(PUBLIC);
    expect(store.visitor()).toBe("public");
  });

  it("another session forgets every price of the last one and reads its own", async () => {
    const { store, state, me, prices, settle } = setup();
    store.want(7);
    await settle();
    state.cookies = "csrf_token_client=tok-2";
    expect(store.price(7)).toBe(PENDING);
    store.want(7);
    await settle();
    expect(me).toHaveBeenCalledTimes(2);
    expect(prices).toHaveBeenCalledTimes(2);
    expect(store.price(7)).toMatchObject({ kind: "own" });
  });

  it("an answer for the last session that comes late is dropped", async () => {
    let answer: (rows: OwnPriceRow[]) => void = () => {};
    const { store, state, settle } = setup({ rows: () => new Promise<OwnPriceRow[]>((resolve) => (answer = resolve)) });
    store.want(7);
    await settle();
    state.cookies = "csrf_token_client=tok-2";
    store.want(8);
    answer([{ id: 7, price: "9.9900", currency: "USD" }]);
    await settle();
    expect(store.price(7)).toBe(PENDING);
  });
});

describe("the pure parts", () => {
  it("idBatches: each id once, smallest first, at most 100 a batch, only service ids", () => {
    expect(idBatches([5, 3, 5, 0, -1, 1.5, Number.NaN, 9])).toEqual([[3, 5, 9]]);
    const many = idBatches(Array.from({ length: 205 }, (_, i) => 205 - i));
    expect(many.map((batch) => batch.length)).toEqual([100, 100, 5]);
    expect(many[0][0]).toBe(1);
    expect(idBatches([])).toEqual([]);
  });

  it("ownPricesQuery: the ids as one comma list, and a page of one row per id", () => {
    expect(ownPricesQuery([1, 2, 3])).toEqual({ ids: "1,2,3", _start: 0, _end: 3 });
  });

  it("statesFromRows: an own price per row with a money string and a currency, not available for the rest", () => {
    const states = statesFromRows([1, 2, 3, 4], [
      { id: 1, price: "0.1000", currency: "USD" },
      { id: 3, price: "abc", currency: "USD" },
      { id: 4, price: "2.0000", currency: "" },
      { id: 9, price: "1.0000", currency: "USD" },
    ]);
    expect([...states.keys()]).toEqual([1, 2, 3, 4]);
    expect(states.get(1)).toEqual({ kind: "own", price: "0.1000", currency: "USD" });
    expect(states.get(2)).toBe(UNAVAILABLE);
    expect(states.get(3)).toBe(UNAVAILABLE);
    expect(states.get(4)).toBe(UNAVAILABLE);
  });

  it("isNotMerchantAnswer: 401 and 403 say the visitor is not a merchant rank; any other failure does not tell", () => {
    const failure = (status: number) => new ApiError({ status });
    expect(isNotMerchantAnswer(failure(401))).toBe(true);
    expect(isNotMerchantAnswer(failure(403))).toBe(true);
    for (const other of [failure(0), failure(404), failure(429), failure(500), failure(503)]) expect(isNotMerchantAnswer(other)).toBe(false);
    expect(isNotMerchantAnswer(new Error("down"))).toBe(false);
    expect(isNotMerchantAnswer(undefined)).toBe(false);
  });

  it("liftOwnPricesGuard takes the guard's attribute off the page, and again is harmless", () => {
    const attributes = new Set([OWN_PRICES_ATTRIBUTE, "lang"]);
    const root = { removeAttribute: (name: string) => void attributes.delete(name) };
    liftOwnPricesGuard(root);
    liftOwnPricesGuard(root);
    expect([...attributes]).toEqual(["lang"]);
  });

  it("merchantSessionKey: the portal cookie's value, nothing for the shop's cookie or none", () => {
    expect(merchantSessionKey("a=1; csrf_token_client=tok-1")).toBe("tok-1");
    expect(merchantSessionKey(`${RETAIL_COOKIE}; ${MERCHANT_COOKIE}`)).toBe("tok-1");
    expect(merchantSessionKey(RETAIL_COOKIE)).toBeUndefined();
    expect(merchantSessionKey("csrf_token_client=")).toBeUndefined();
    expect(merchantSessionKey("")).toBeUndefined();
  });

  it("the states a slot compares by identity are distinct", () => {
    expect(new Set([EARLY, PUBLIC, PENDING, UNAVAILABLE, FAILED]).size).toBe(5);
  });
});

describe("OWN_PRICES_GUARD: the script that runs before the first paint", () => {
  function run(cookie: string): boolean {
    const attributes = new Map<string, string>();
    const document = { cookie, documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) } };
    new Function("document", OWN_PRICES_GUARD)(document);
    return attributes.has(OWN_PRICES_ATTRIBUTE);
  }

  it("marks the page of a browser that holds a merchant session", () => {
    expect(run(MERCHANT_COOKIE)).toBe(true);
    expect(run(`theme=dark; ${MERCHANT_COOKIE}`)).toBe(true);
    expect(run(`${RETAIL_COOKIE}; ${MERCHANT_COOKIE}`)).toBe(true);
  });

  it("leaves a guest's and a retail account's page alone", () => {
    expect(run("")).toBe(false);
    expect(run(RETAIL_COOKIE)).toBe(false);
    expect(run("csrf_token_client=")).toBe(false);
    expect(run("xcsrf_token_client=tok")).toBe(false);
  });

  it("never throws, even without a readable cookie", () => {
    expect(() => new Function("document", OWN_PRICES_GUARD)({})).not.toThrow();
  });
});
