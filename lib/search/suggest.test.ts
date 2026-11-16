import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SuggestBody } from "@/lib/api/types";
import { SUGGEST_CACHE_SIZE, SUGGEST_DELAY, createSuggestClient, fetchSuggest, suggestKey, type SuggestFetcher } from "./suggest";

const answer = (q: string, engine: SuggestBody["engine"] = "typesense"): SuggestBody => ({
  q,
  engine,
  ghost: null,
  completions: [],
  services: [],
  filters: [],
  didYouMean: null,
  popular: [],
  intent: null,
});

/** A fetcher whose requests the test settles by hand; records each request and its signal. */
function manualFetcher() {
  const calls: { q: string; signal: AbortSignal; resolve: (body: SuggestBody) => void; reject: (error: unknown) => void }[] = [];
  const fetcher: SuggestFetcher = (q, signal) =>
    new Promise((resolve, reject) => {
      calls.push({ q, signal, resolve, reject });
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  return { calls, fetcher };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("suggest client", () => {
  it("waits 150 ms after the last keystroke, then asks once", async () => {
    const { calls, fetcher } = manualFetcher();
    const onAnswer = vi.fn();
    const client = createSuggestClient({ fetcher, onAnswer });
    client.type("s");
    client.type("sa");
    client.type("sam");
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY - 1);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls.map((call) => call.q)).toEqual(["sam"]);
    calls[0].resolve(answer("sam"));
    await vi.advanceTimersByTimeAsync(0);
    expect(onAnswer).toHaveBeenCalledWith("sam", answer("sam"));
  });

  it("every keystroke aborts the request in flight, and an overtaken answer is never delivered", async () => {
    const { calls, fetcher } = manualFetcher();
    const onAnswer = vi.fn();
    const onError = vi.fn();
    const client = createSuggestClient({ fetcher, onAnswer, onError });
    client.type("sam");
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY);
    expect(calls).toHaveLength(1);
    client.type("sams");
    expect(calls[0].signal.aborted).toBe(true);
    // Even an answer that arrives after its abort is dropped.
    calls[0].resolve(answer("sam"));
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY);
    calls[1].resolve(answer("sams"));
    await vi.advanceTimersByTimeAsync(0);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith("sams", answer("sams"));
    expect(onError).not.toHaveBeenCalled();
  });

  it("answers a text asked before from the LRU at once, without a request", async () => {
    const { calls, fetcher } = manualFetcher();
    const onAnswer = vi.fn();
    const client = createSuggestClient({ fetcher, onAnswer });
    client.now("icl");
    calls[0].resolve(answer("icl"));
    await vi.advanceTimersByTimeAsync(0);
    client.type("iclo");
    client.type("ICL");
    expect(onAnswer).toHaveBeenLastCalledWith("ICL", answer("icl"));
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY * 2);
    expect(calls.map((call) => call.q)).toEqual(["icl"]);
  });

  it("keeps 30 answers: the oldest one is asked again", async () => {
    const { calls, fetcher } = manualFetcher();
    const client = createSuggestClient({ fetcher, onAnswer: () => {} });
    for (let i = 0; i <= SUGGEST_CACHE_SIZE; i++) {
      client.now(`q${i}`);
      calls[i].resolve(answer(`q${i}`));
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(calls).toHaveLength(SUGGEST_CACHE_SIZE + 1);
    client.now(`q${SUGGEST_CACHE_SIZE}`);
    expect(calls).toHaveLength(SUGGEST_CACHE_SIZE + 1);
    client.now("q0");
    expect(calls).toHaveLength(SUGGEST_CACHE_SIZE + 2);
  });

  it("the LRU key holds the currency: another currency asks again", async () => {
    const { calls, fetcher } = manualFetcher();
    let currency = "USD";
    const client = createSuggestClient({ fetcher, onAnswer: () => {}, scope: () => currency });
    client.now("icl");
    calls[0].resolve(answer("icl"));
    await vi.advanceTimersByTimeAsync(0);
    currency = "EUR";
    client.now("icl");
    expect(calls).toHaveLength(2);
  });

  it("a fallback answer is shown but not kept, so the box recovers with the engine", async () => {
    const { calls, fetcher } = manualFetcher();
    const onAnswer = vi.fn();
    const client = createSuggestClient({ fetcher, onAnswer });
    client.now("icl");
    calls[0].resolve(answer("icl", "fallback"));
    await vi.advanceTimersByTimeAsync(0);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    client.now("icl");
    expect(calls).toHaveLength(2);
  });

  it("stops asking after two errors in a row, until resume (the next focus)", async () => {
    const { calls, fetcher } = manualFetcher();
    const onError = vi.fn();
    const client = createSuggestClient({ fetcher, onAnswer: () => {}, onError });
    client.now("a");
    calls[0].reject(new Error("boom"));
    await vi.advanceTimersByTimeAsync(0);
    client.now("ab");
    calls[1].reject(new Error("boom"));
    await vi.advanceTimersByTimeAsync(0);
    expect(client.paused).toBe(true);
    expect(onError).toHaveBeenLastCalledWith("ab", expect.any(Error), true);
    client.type("abc");
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY);
    expect(calls).toHaveLength(2);
    client.resume();
    client.type("abc");
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY);
    expect(calls).toHaveLength(3);
  });

  it("a success resets the error count; an abort is not an error", async () => {
    const { calls, fetcher } = manualFetcher();
    const onError = vi.fn();
    const client = createSuggestClient({ fetcher, onAnswer: () => {}, onError });
    client.now("a");
    calls[0].reject(new Error("boom"));
    await vi.advanceTimersByTimeAsync(0);
    client.now("ab");
    calls[1].resolve(answer("ab"));
    await vi.advanceTimersByTimeAsync(0);
    client.now("abc");
    client.now("abcd");
    await vi.advanceTimersByTimeAsync(0);
    calls[3].reject(new Error("boom"));
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(client.paused).toBe(false);
  });

  it("cancel stops what is pending and drops what is in flight", async () => {
    const { calls, fetcher } = manualFetcher();
    const onAnswer = vi.fn();
    const client = createSuggestClient({ fetcher, onAnswer });
    client.now("a");
    client.cancel();
    expect(calls[0].signal.aborted).toBe(true);
    client.type("ab");
    client.cancel();
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY * 2);
    expect(calls).toHaveLength(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe("suggestKey", () => {
  it("reads the text as the API does: case and inner spaces do not matter, a trailing space does", () => {
    expect(suggestKey("  Samsung   FRP")).toBe("samsung frp");
    expect(suggestKey("samsung ")).toBe("samsung ");
    expect(suggestKey("samsung   ")).toBe("samsung ");
    expect(suggestKey("samsung")).toBe("samsung");
    expect(suggestKey("   ")).toBe("");
  });
});

describe("fetchSuggest", () => {
  it("always sends q (also empty) and the currency, through the site's origin", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(answer("")), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    try {
      await fetchSuggest("", "EUR", new AbortController().signal);
      await fetchSuggest("at&t", undefined, new AbortController().signal);
      const urls = fetch.mock.calls.map((call) => String((call as unknown[])[0]));
      expect(urls).toEqual(["/store/v1/search/suggest?q=&currency=EUR", "/store/v1/search/suggest?q=at%26t"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
