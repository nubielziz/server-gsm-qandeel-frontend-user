// An order's page keeps itself fresh (shop decision 010). Two things make the server page be drawn again with `router.refresh()`:
// - while the order is open (not completed, not rejected) every 30 seconds, but only while the tab is visible, so "Request
//   verification" appears after the order completes without a manual reload;
// - once, when the end of the cancel window has passed, so the Cancel button and its sentence go by themselves.
// Neither refresh runs while a modal of the page is open or a request of the page is running: the buttons of the page "hold"
// refreshes meanwhile (a refresh would take the modal from under the visitor's hand). Pure: timers and the visibility come in
// as a clock, so the rules are tested with fake timers and without a browser.

/** The time between two refreshes of an open order. */
export const OPEN_ORDER_REFRESH_MS = 30_000;
/**
 * How long after the end of the cancel window the page refreshes. The API sends the order at that moment, a moment later it
 * says "already sent": refreshing on the dot could still read the old answer.
 */
export const CANCEL_DEADLINE_GRACE_MS = 2_000;
/** The longest delay a timer takes (2^31 - 1 ms); a longer one fires at once. */
const MAX_TIMER_MS = 2_147_483_647;

let holds = 0;

/**
 * Stops the refreshes of the order page until the returned function is called: a modal is open or a request is running.
 * Holds add up (the order page and a row of a list may both hold), and each release counts once.
 *
 * @returns the function that lets go
 */
export function holdOrderRefresh(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
  };
}

/** True while something holds the refreshes. */
export function orderRefreshHeld(): boolean {
  return holds > 0;
}

/** True while the order can still change by itself: it is neither completed nor rejected. */
export function isOpenOrder(status: string): boolean {
  return status !== "completed" && status !== "rejected";
}

/** The timers and the visibility the watcher reads. */
export type OrderRefreshClock = {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  /** False while the tab is hidden. */
  visible(): boolean;
};

/** The browser's clock (the globals are read when called, so fake timers apply). Without a `document` the tab counts as visible. */
export const realClock: OrderRefreshClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  visible: () => typeof document === "undefined" || document.visibilityState === "visible",
};

export type WatchOrderOptions = {
  /** `router.refresh()`. */
  refresh: () => void;
  /** The order is not final: poll it. */
  open: boolean;
  /** ISO time the cancel window ends, when the order waits in one. */
  cancelUntil?: string | null;
  clock?: OrderRefreshClock;
};

/**
 * Starts the two refreshes of an order page. The poll skips a tick while the tab is hidden or the page holds refreshes; the
 * deadline refresh runs once, `CANCEL_DEADLINE_GRACE_MS` after `cancelUntil` (at once when that has passed already), and is
 * skipped while the page holds refreshes: the next poll, or the answer to the visitor's own request, catches the page up.
 *
 * @returns the function that stops both
 */
export function watchOrder({ refresh, open, cancelUntil, clock = realClock }: WatchOrderOptions): () => void {
  const stops: Array<() => void> = [];

  if (open) {
    const poll = clock.setInterval(() => {
      if (clock.visible() && !orderRefreshHeld()) refresh();
    }, OPEN_ORDER_REFRESH_MS);
    stops.push(() => clock.clearInterval(poll));
  }

  const until = cancelUntil ? Date.parse(cancelUntil) : Number.NaN;
  if (!Number.isNaN(until)) {
    const delay = Math.min(Math.max(until + CANCEL_DEADLINE_GRACE_MS - clock.now(), 0), MAX_TIMER_MS);
    const deadline = clock.setTimeout(() => {
      if (!orderRefreshHeld()) refresh();
    }, delay);
    stops.push(() => clock.clearTimeout(deadline));
  }

  return () => {
    for (const stop of stops) stop();
  };
}
