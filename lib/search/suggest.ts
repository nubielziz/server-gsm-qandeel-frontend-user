// The suggestion requests of the header combobox (backend plan 29 §7 "Requests"). One client per box:
// - a keystroke cancels the request in flight at once (AbortController) and asks again 150 ms after the last keystroke;
// - answers are kept in a small in-memory LRU per tab (30 answers): typing back to an earlier text answers at once,
//   without a request; the key holds the currency (answers are priced) and the text as the API reads it;
// - only the newest text's answer is delivered (an aborted or overtaken answer is dropped);
// - after two failed requests in a row it stops asking until `resume()` (the next focus), so a broken API is not asked
//   on every keystroke; a fallback answer (`engine: 'fallback'`) is a valid answer, shown but not kept in the LRU, so the
//   box recovers as soon as the engine does.
// Nothing here touches the DOM; timers and the request are injected (unit-tested with fake timers).
import { api } from "@/lib/api/browser";
import { isAbortError } from "@/lib/api/errors";
import type { SuggestBody } from "@/lib/api/types";

/** The debounce after the last keystroke, in ms. */
export const SUGGEST_DELAY = 150;
/** Answers kept per tab. */
export const SUGGEST_CACHE_SIZE = 30;
/** Failed requests in a row after which the client stops asking until the next focus. */
export const SUGGEST_MAX_ERRORS = 2;
/** The longest text sent (the API cuts at 100 characters after its own normalising). */
export const SUGGEST_MAX_LENGTH = 100;

export type SuggestFetcher = (q: string, signal: AbortSignal) => Promise<SuggestBody>;

export type SuggestClientOptions = {
  /** Asks the API (`fetchSuggest` in the browser). */
  fetcher: SuggestFetcher;
  /** The newest text's answer (from the API or the LRU). `q` is the raw text it answers. */
  onAnswer: (q: string, body: SuggestBody) => void;
  /** A request failed (not an abort). `paused` is true once the client stopped asking. */
  onError?: (q: string, error: unknown, paused: boolean) => void;
  /** What else an answer depends on besides the text: the currency. Part of the LRU key. */
  scope?: () => string;
  delay?: number;
  cacheSize?: number;
  /** Timers (tests pass fake ones). */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export type SuggestClient = {
  /** A keystroke: cancel what is pending or in flight; answer from the LRU at once, else ask after the debounce. */
  type(q: string): void;
  /** Ask now, without the debounce (the text found when the box wakes up, a focus on an empty box). */
  now(q: string): void;
  /** Cancel what is pending or in flight (the box closed or went away). */
  cancel(): void;
  /** A new focus: ask again after errors. */
  resume(): void;
  /** True after two failed requests in a row, until `resume()`. */
  readonly paused: boolean;
};

/**
 * The text as the API reads it, for the LRU key: lower case, whitespace collapsed, no leading space, and a trailing
 * space kept as one (`samsung ` asks for the next word, `samsung` completes the word: two different answers).
 */
export function suggestKey(q: string): string {
  const text = q.slice(0, SUGGEST_MAX_LENGTH).toLowerCase().replace(/\s+/g, " ").replace(/^ /, "");
  return text === " " ? "" : text;
}

export function createSuggestClient(options: SuggestClientOptions): SuggestClient {
  const delay = options.delay ?? SUGGEST_DELAY;
  const size = options.cacheSize ?? SUGGEST_CACHE_SIZE;
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const cache = new Map<string, SuggestBody>();
  let timer: unknown = null;
  let controller: AbortController | null = null;
  /** Bumped for every new text: an answer for an older one is dropped even if its abort came too late. */
  let generation = 0;
  let errors = 0;

  const keyOf = (q: string) => `${options.scope?.() ?? ""}\u0000${suggestKey(q)}`;

  function stop() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    controller?.abort();
    controller = null;
  }

  function remember(key: string, body: SuggestBody) {
    cache.delete(key);
    cache.set(key, body);
    while (cache.size > size) cache.delete(cache.keys().next().value as string);
  }

  /** The LRU's answer for `q` (refreshed as most recent), or undefined. */
  function cached(key: string): SuggestBody | undefined {
    const body = cache.get(key);
    if (body) remember(key, body);
    return body;
  }

  async function ask(q: string, mine: number) {
    timer = null;
    const key = keyOf(q);
    const ctrl = new AbortController();
    controller = ctrl;
    try {
      const body = await options.fetcher(q.slice(0, SUGGEST_MAX_LENGTH), ctrl.signal);
      if (mine !== generation || ctrl.signal.aborted) return;
      errors = 0;
      if (body.engine !== "fallback") remember(key, body);
      options.onAnswer(q, body);
    } catch (error) {
      if (mine !== generation || ctrl.signal.aborted || isAbortError(error)) return;
      errors += 1;
      options.onError?.(q, error, errors >= SUGGEST_MAX_ERRORS);
    } finally {
      if (controller === ctrl) controller = null;
    }
  }

  function start(q: string, wait: number) {
    stop();
    const mine = ++generation;
    const hit = cached(keyOf(q));
    if (hit) {
      options.onAnswer(q, hit);
      return;
    }
    if (errors >= SUGGEST_MAX_ERRORS) return;
    if (wait <= 0) void ask(q, mine);
    else timer = setTimer(() => void ask(q, mine), wait);
  }

  return {
    type: (q) => start(q, delay),
    now: (q) => start(q, 0),
    cancel() {
      stop();
      generation += 1;
    },
    resume() {
      errors = 0;
    },
    get paused() {
      return errors >= SUGGEST_MAX_ERRORS;
    },
  };
}

/**
 * `GET /store/v1/search/suggest?q=…&currency=…` through the site's own origin. `q=` is always sent, also empty (the
 * empty box asks for the popular searches), so the query is written by hand: the shared query builder leaves empty
 * values out.
 */
export function fetchSuggest(q: string, currency: string | undefined, signal: AbortSignal): Promise<SuggestBody> {
  const params = new URLSearchParams({ q });
  if (currency) params.set("currency", currency);
  return api.get<SuggestBody>(`/store/v1/search/suggest?${params.toString()}`, { signal });
}
