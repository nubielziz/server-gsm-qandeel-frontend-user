// The unread count of the bell, kept in the browser (plan D10). One small external store per family (store, client),
// read with `useSyncExternalStore`:
// - the server passes the first count (`reconcile`), so the bell never flashes; a later server count never overwrites a
//   newer read of the store (a `router.refresh()` can land after the store has already asked), it makes the store ask;
// - while a bell is mounted and the tab is visible the store asks `…/unread-count` at most once a minute (the floor also
//   holds after a seed and after a failure); a hidden tab does not poll, and a tab that becomes visible polls at once when
//   the floor has passed;
// - `refresh` is for actions (an item was read): it ignores the floor but never runs two requests at once;
// - 429 waits for `Retry-After` (at least a minute), other failures back off, and the last known count stays on screen;
// - 401 and 403 stop the polling for good (the session is gone; the layout sends the visitor to sign-in on the next
//   navigation). The store never signs anyone out and never changes a cookie;
// - while the live stream is open (`setLive(family, true)`, lib/realtime) the stream brings every change (`push`), so the
//   poll only checks now and then: its floor is five minutes instead of one. A stream that closes sets the floor back
//   and the store asks at once when the minute has already passed.
// Import only from Client Components. `createUnreadStore` takes its dependencies so the tests need no browser.
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import type { UnreadCount } from "@/lib/api/types";
import type { AccountFamily } from "@/lib/account/family";
import { NOTIFICATION_API, UNREAD_CAP } from "./link";

export { UNREAD_CAP };
/** The least time between two polls of one family. */
export const POLL_INTERVAL_MS = 60_000;
/** The same while the live stream is open: a safety poll for a doorbell that never rang (plan 27 §5). */
export const LIVE_POLL_INTERVAL_MS = 300_000;
/** The longest wait after a 429 or after repeated failures. */
export const MAX_BACKOFF_MS = 10 * 60_000;

export type UnreadEnv = {
  /** The unread count of a family; rejects with an `ApiError`. */
  fetchCount(family: AccountFamily): Promise<number>;
  /** True while the tab is in the foreground. */
  isVisible(): boolean;
  /** Calls `listener` whenever the tab's visibility changes; returns the function that stops it. */
  onVisibilityChange(listener: () => void): () => void;
};

export type UnreadStore = {
  /** For `useSyncExternalStore`: `listener` is called when the count changes. The first listener starts the polling, the last one stops it. */
  subscribe(family: AccountFamily, listener: () => void): () => void;
  /** The count (0 to 100), or `null` before the store knows one. */
  getSnapshot(family: AccountFamily): number | null;
  /** Takes a count as the truth: it starts the one-minute countdown again and lifts a stop (the session works). For a count that cannot be older than the store's own, which no server render guarantees: use `reconcile`. */
  seed(family: AccountFamily, count: number): void;
  /**
   * A count a server render brought (first paint, router.refresh, a remount). It may be older than the store's own last
   * read, so it never overwrites a known count: when the two differ the store asks the API at once. With no count yet, or
   * after a stop, it is a seed.
   */
  reconcile(family: AccountFamily, count: number): void;
  /** Asks the API now (after an action). Resolves when the request is over; it does nothing after a stop or during a 429 wait. */
  refresh(family: AccountFamily): Promise<void>;
  /** A count a live stream event brought (`unread.changed`, `notification.created`, `notification.read`): the same as `seed`. */
  push(family: AccountFamily, count: number): void;
  /** Tells the store whether the live stream is open: the poll floor is `LIVE_POLL_INTERVAL_MS` while it is, `POLL_INTERVAL_MS` after. */
  setLive(family: AccountFamily, live: boolean): void;
};

type Slot = {
  count: number | null;
  stopped: boolean;
  /** The live stream is open: the poll floor is the long one. */
  live: boolean;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setTimeout> | undefined;
  stopVisibility: (() => void) | undefined;
  /** When the count was last known (a fetch, a failed fetch or a seed): the floor counts from here. */
  lastAt: number | null;
  /** No request before this time (429 and failure back-off). */
  blockedUntil: number;
  failures: number;
  inFlight: boolean;
  /** An action asked for a refresh while a request was running: ask once more when it ends. */
  again: boolean;
};

function clamp(count: number): number {
  return Math.min(UNREAD_CAP, Math.max(0, Math.trunc(count)));
}

/** 401 and 403: no session on this family (any more), so asking again cannot help. */
function endsPolling(error: unknown): boolean {
  return isApiError(error) && (error.status === 401 || error.status === 403);
}

export function createUnreadStore(env: UnreadEnv): UnreadStore {
  const slots: Record<AccountFamily, Slot> = {
    store: newSlot(),
    client: newSlot(),
  };

  function newSlot(): Slot {
    return {
      count: null,
      stopped: false,
      live: false,
      listeners: new Set(),
      timer: undefined,
      stopVisibility: undefined,
      lastAt: null,
      blockedUntil: 0,
      failures: 0,
      inFlight: false,
      again: false,
    };
  }

  /** The least time between two polls of this slot. */
  function floorOf(slot: Slot): number {
    return slot.live ? LIVE_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
  }

  function clearTimer(slot: Slot) {
    if (slot.timer !== undefined) clearTimeout(slot.timer);
    slot.timer = undefined;
  }

  function setCount(slot: Slot, count: number) {
    if (slot.count === count) return;
    slot.count = count;
    for (const listener of [...slot.listeners]) listener();
  }

  /** Arms the next poll: the rest of the floor, or the end of a back-off. Only while a bell is mounted and the tab is visible. */
  function schedule(family: AccountFamily) {
    const slot = slots[family];
    clearTimer(slot);
    if (slot.stopped || slot.listeners.size === 0 || !env.isVisible()) return;
    const now = Date.now();
    const floor = slot.lastAt === null ? 0 : slot.lastAt + floorOf(slot) - now;
    const delay = Math.max(0, floor, slot.blockedUntil - now);
    slot.timer = setTimeout(() => {
      slot.timer = undefined;
      if (!env.isVisible()) return; // hidden: the visibility listener polls when the tab comes back
      void run(family, false);
    }, delay);
  }

  async function run(family: AccountFamily, force: boolean): Promise<void> {
    const slot = slots[family];
    if (slot.stopped) return;
    const now = Date.now();
    if (now < slot.blockedUntil || (!force && slot.lastAt !== null && now - slot.lastAt < floorOf(slot))) {
      schedule(family);
      return;
    }
    if (slot.inFlight) {
      if (force) slot.again = true;
      return;
    }
    slot.inFlight = true;
    try {
      const unread = await env.fetchCount(family);
      if (typeof unread !== "number" || !Number.isFinite(unread)) throw new Error("unread-count: not a number");
      slot.lastAt = Date.now();
      slot.failures = 0;
      slot.blockedUntil = 0;
      setCount(slot, clamp(unread));
    } catch (error) {
      slot.lastAt = Date.now();
      if (endsPolling(error)) {
        slot.stopped = true;
        clearTimer(slot);
      } else if (isApiError(error) && error.status === 429) {
        const wait = Math.max((error.retryAfter ?? 0) * 1000, POLL_INTERVAL_MS);
        slot.blockedUntil = slot.lastAt + Math.min(wait, MAX_BACKOFF_MS);
      } else {
        slot.failures += 1;
        slot.blockedUntil = slot.lastAt + Math.min(POLL_INTERVAL_MS * 2 ** (slot.failures - 1), MAX_BACKOFF_MS);
      }
    } finally {
      slot.inFlight = false;
    }
    if (slot.again && !slot.stopped) {
      slot.again = false;
      await run(family, true);
    } else {
      slot.again = false;
      schedule(family);
    }
  }

  function onVisibility(family: AccountFamily) {
    const slot = slots[family];
    if (env.isVisible()) void run(family, false);
    else clearTimer(slot);
  }

  function start(family: AccountFamily) {
    const slot = slots[family];
    slot.stopVisibility = env.onVisibilityChange(() => onVisibility(family));
    // Not a request right here: the bell hands over the server's count in the same commit, and a seed moves this to a minute later.
    schedule(family);
  }

  function seedSlot(family: AccountFamily, count: number) {
    const slot = slots[family];
    slot.lastAt = Date.now();
    slot.failures = 0;
    slot.blockedUntil = 0;
    slot.stopped = false;
    setCount(slot, clamp(count));
    schedule(family);
  }

  function halt(family: AccountFamily) {
    const slot = slots[family];
    clearTimer(slot);
    slot.stopVisibility?.();
    slot.stopVisibility = undefined;
  }

  return {
    subscribe(family, listener) {
      const slot = slots[family];
      slot.listeners.add(listener);
      if (slot.listeners.size === 1) start(family);
      return () => {
        slot.listeners.delete(listener);
        if (slot.listeners.size === 0) halt(family);
      };
    },
    getSnapshot(family) {
      return slots[family].count;
    },
    seed: seedSlot,
    reconcile(family, count) {
      const slot = slots[family];
      if (slot.count === null || slot.stopped) seedSlot(family, count);
      else if (clamp(count) !== slot.count) void run(family, true);
    },
    refresh(family) {
      return run(family, true);
    },
    push: seedSlot,
    setLive(family, live) {
      const slot = slots[family];
      if (slot.live === live) return;
      slot.live = live;
      // The floor moved: the armed timer is for the old one. When the stream closed and the short floor has passed, this polls now.
      schedule(family);
    },
  };
}

const browserEnv: UnreadEnv = {
  async fetchCount(family) {
    const answer = await api.get<UnreadCount>(`${NOTIFICATION_API[family]}/unread-count`);
    return answer?.unread;
  },
  isVisible: () => typeof document === "undefined" || document.visibilityState === "visible",
  onVisibilityChange(listener) {
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
};

/** The store the bell and the notification actions of this page share. */
export const unreadStore = createUnreadStore(browserEnv);
