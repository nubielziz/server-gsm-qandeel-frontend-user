// When the notifications list refreshes itself (feature 27, plan §5.1): events are collected for 400 ms and the list then
// re-renders in place with `router.refresh()`, at most once every 2 s. Pure: timers and the refresh are passed in.

/** Events that arrive within this window share one refresh. */
export const REFRESH_COLLECT_MS = 400;
/** The least time between two refreshes. */
export const REFRESH_MIN_GAP_MS = 2_000;

export type RefreshSchedulerOptions = {
  run(): void;
  timers: { setTimeout(callback: () => void, ms: number): unknown; clearTimeout(handle: unknown): void; now(): number };
  collectMs?: number;
  minGapMs?: number;
};

export type RefreshScheduler = {
  /** Asks for a refresh: it runs once the collect window and the minimum gap have both passed. Further asks join it. */
  request(): void;
  dispose(): void;
};

export function createRefreshScheduler({ run, timers, collectMs = REFRESH_COLLECT_MS, minGapMs = REFRESH_MIN_GAP_MS }: RefreshSchedulerOptions): RefreshScheduler {
  let timer: unknown = null;
  let lastRunAt = Number.NEGATIVE_INFINITY;
  return {
    request() {
      // The timer is armed by the first ask and not moved by later ones, so a steady stream of events cannot postpone it for ever.
      if (timer !== null) return;
      const now = timers.now();
      const delay = Math.max(collectMs, lastRunAt + minGapMs - now);
      timer = timers.setTimeout(() => {
        timer = null;
        lastRunAt = timers.now();
        run();
      }, delay);
    },
    dispose() {
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
    },
  };
}

/** What asked for the refresh since the last one. */
export type RefreshWish = {
  /** Something new arrived (an item, a resync, a reconnect): the list must be drawn again. */
  always: boolean;
  /** The viewer marked everything read somewhere. */
  all: boolean;
  /** Ids marked read somewhere. */
  readIds: Set<number>;
};

/**
 * Whether the list on screen is out of date. New items always are; a "read" event only matters when it concerns an
 * item that is still shown as unread (the tab that did the reading has already refreshed itself).
 */
export function needsRefresh(wish: RefreshWish, unreadOnScreen: ReadonlySet<number>): boolean {
  if (wish.always) return true;
  if (unreadOnScreen.size === 0) return false;
  if (wish.all) return true;
  for (const id of wish.readIds) if (unreadOnScreen.has(id)) return true;
  return false;
}
