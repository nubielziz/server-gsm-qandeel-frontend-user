// The bell's arrival animation (owner, 2026-11-15): when the icon swings, when the badge pops and when its number rolls.
// - Only a live arrival rings (`notification.created` with `live: true`): never a first paint, a poll that finds more, a
//   replay after a reconnect or a resync. At most one ring every 3 s (the toast's window); the number changes every time.
// - Only a visible tab rings, as only a visible tab toasts (the tabs share one stream, so every tab updates its badge). A
//   tab that was hidden when something arrived rings once when the visitor comes back.
// - A read rolls the number down; it never rings. The stream's `notification.read` says the new count; a read action of
//   this tab says "the next lower count" (its own refetch and the stream's event may land in either order).
// - Reduced motion: no cue at all, so the number just changes (and the CSS plays nothing then either).
// Two pure parts: `createBellMotion` turns stream events into cues (counters a bell compares with what it has played), and
// `nextBellView` turns the newest cue and the count on screen into what the bell plays. `bellMotion` at the end is the
// browser's instance: import it only from Client Components.
import type { AccountFamily } from "@/lib/account/family";
import { UNREAD_CAP } from "./link";

/** At most one ring in this window (the same 3 s as the toast's). */
export const RING_WINDOW_MS = 3_000;

/** A count change worth animating. The bell plays it only when it shows the count `to`. */
export type BellChange = {
  /** Grows with every cue. */
  seq: number;
  /** The unread count after the event (capped like the store's), or null for "the next count below the one on screen" (a read action). */
  to: number | null;
  /** The bell rang with this change: the badge pops. */
  pop: boolean;
};

export type BellMotionSnapshot = {
  /** How many rings were asked for since the page loaded: the icon swings each time it grows. */
  rings: number;
  /** The newest change worth animating, or null. */
  change: BellChange | null;
};

/** No cue yet (the server's snapshot and the start of every family). */
export const IDLE_MOTION: BellMotionSnapshot = Object.freeze({ rings: 0, change: null });

export type BellMotionEnv = {
  now(): number;
  /** True while the tab is in the foreground. */
  isVisible(): boolean;
  /** True when the visitor asked for reduced motion. */
  reducedMotion(): boolean;
  /** Calls `listener` whenever the tab's visibility changes; returns the function that stops it. */
  onVisibilityChange(listener: () => void): () => void;
};

export type BellMotion = {
  /** For `useSyncExternalStore`. The first listener of a family starts watching the tab's visibility, the last one stops it. */
  subscribe(family: AccountFamily, listener: () => void): () => void;
  /** The cues of a family; the same object until the next cue. */
  getSnapshot(family: AccountFamily): BellMotionSnapshot;
  /** A `notification.created` frame. Call it before the count reaches the store, so one render sees both. */
  arrival(family: AccountFamily, unread: number, live: boolean): void;
  /**
   * A read: a `notification.read` frame (this tab, another tab or another device) with its count, or `null` from a read
   * action of this page whose new count is not known yet. Call it before the count reaches the store.
   */
  read(family: AccountFamily, unread: number | null): void;
};

type Slot = {
  snapshot: BellMotionSnapshot;
  listeners: Set<() => void>;
  stopVisibility: (() => void) | undefined;
  lastRingAt: number | null;
  /** A live item arrived while the tab was hidden: ring once when it is shown again. */
  missed: boolean;
};

function clamp(count: number): number {
  return Math.min(UNREAD_CAP, Math.max(0, Math.trunc(count)));
}

export function createBellMotion(env: BellMotionEnv): BellMotion {
  const slots: Record<AccountFamily, Slot> = { store: newSlot(), client: newSlot() };

  function newSlot(): Slot {
    return { snapshot: IDLE_MOTION, listeners: new Set(), stopVisibility: undefined, lastRingAt: null, missed: false };
  }

  function publish(slot: Slot, snapshot: BellMotionSnapshot) {
    slot.snapshot = snapshot;
    for (const listener of [...slot.listeners]) listener();
  }

  /** True (and the window starts again) when no ring played in the last `RING_WINDOW_MS`. No timer: a timestamp is enough. */
  function takeRing(slot: Slot): boolean {
    const now = env.now();
    if (slot.lastRingAt !== null && now - slot.lastRingAt < RING_WINDOW_MS) return false;
    slot.lastRingAt = now;
    return true;
  }

  function nextChange(slot: Slot, unread: number | null, pop: boolean): BellChange {
    return { seq: (slot.snapshot.change?.seq ?? 0) + 1, to: unread === null ? null : clamp(unread), pop };
  }

  /** The visitor comes back to a tab that missed a live item: one ring, no pop (the number is already right). */
  function onVisibility(slot: Slot) {
    if (!env.isVisible() || !slot.missed) return;
    slot.missed = false;
    if (env.reducedMotion() || !takeRing(slot)) return;
    publish(slot, { ...slot.snapshot, rings: slot.snapshot.rings + 1 });
  }

  return {
    subscribe(family, listener) {
      const slot = slots[family];
      slot.listeners.add(listener);
      if (slot.listeners.size === 1) slot.stopVisibility = env.onVisibilityChange(() => onVisibility(slot));
      return () => {
        slot.listeners.delete(listener);
        if (slot.listeners.size > 0) return;
        slot.stopVisibility?.();
        slot.stopVisibility = undefined;
      };
    },
    getSnapshot(family) {
      return slots[family].snapshot;
    },
    arrival(family, unread, live) {
      const slot = slots[family];
      // A replayed item (reconnect, hand-over between tabs) is not news.
      if (!live) return;
      if (!env.isVisible()) {
        slot.missed = true;
        return;
      }
      if (env.reducedMotion()) return;
      const ring = takeRing(slot);
      publish(slot, { rings: slot.snapshot.rings + (ring ? 1 : 0), change: nextChange(slot, unread, ring) });
    },
    read(family, unread) {
      const slot = slots[family];
      // Everything was read meanwhile (in another tab): there is nothing to ring for on return.
      if (unread !== null && clamp(unread) === 0) slot.missed = false;
      if (!env.isVisible() || env.reducedMotion()) return;
      publish(slot, { rings: slot.snapshot.rings, change: nextChange(slot, unread, false) });
    },
  };
}

/** What the bell plays now. Pure data: the bell renders it, `nextBellView` moves it on, `settleBellView` ends a part. */
export type BellView = {
  /** The count and its badge text on screen. */
  count: number;
  text: string;
  /** The cue counters already played (or skipped): a bell never plays a cue older than itself. */
  rings: number;
  seq: number;
  /** The icon swings (bell.tsx plays it on the same element whenever `rings` grows). */
  ring: boolean;
  /** The badge pops ("pop") or pops in from nothing ("in"). `popKey` restarts it. */
  pop: "pop" | "in" | null;
  popKey: number;
  /** The old number leaves while the new one comes in: up when the count grew, down when it fell. `rollKey` restarts it. */
  roll: { from: string; up: boolean } | null;
  rollKey: number;
};

/** A bell's first view: the count as it is, and every cue so far counts as played (a mount never animates). */
export function initialBellView(count: number, text: string, motion: BellMotionSnapshot): BellView {
  return {
    count,
    text,
    rings: motion.rings,
    seq: motion.change?.seq ?? 0,
    ring: false,
    pop: null,
    popKey: 0,
    roll: null,
    rollKey: 0,
  };
}

/**
 * The view for this render. Returns `view` itself when nothing changed (the bell calls `setState` only then).
 * - A new ring count swings the icon.
 * - A new cue plays only once the bell shows its count (the cue and the count may land in two renders), or for a read
 *   action's cue the first count below the one on screen. The badge pops in from nothing when it was hidden; else the
 *   number rolls (when its text changed: "99+" to "99+" does not) and the badge pops when the bell rang.
 * - A count change no cue explains (the first read, a poll, a resync, `unread.changed`) just changes the
 *   number; a cue still waiting is dropped then, so a later count cannot replay it.
 */
export function nextBellView(view: BellView, count: number, text: string, motion: BellMotionSnapshot): BellView {
  let next = view;
  if (motion.rings !== view.rings) {
    next = { ...next, rings: motion.rings, ring: motion.rings > view.rings || view.ring };
  }
  const cue = motion.change !== null && motion.change.seq !== view.seq ? motion.change : null;
  if (cue !== null && (cue.to === count || (cue.to === null && count < view.count))) {
    next = { ...next, count, text, seq: cue.seq };
    if (count === 0) {
      next = { ...next, pop: null, roll: null };
    } else if (view.count === 0) {
      next = { ...next, pop: "in", popKey: cue.seq, roll: null };
    } else {
      if (text !== view.text) next = { ...next, roll: { from: view.text, up: count > view.count }, rollKey: cue.seq };
      if (cue.pop) next = { ...next, pop: "pop", popKey: cue.seq };
    }
  } else if (count !== view.count || text !== view.text) {
    next = { ...next, count, text, seq: cue?.seq ?? next.seq, roll: null };
  }
  return next;
}

/** The keyframes of the bell (app/globals.css) and the part of the view each one ends. The arriving number ends with the leaving one. */
const ENDS: Record<string, "ring" | "pop" | "roll"> = {
  "bell-ring": "ring",
  "badge-pop": "pop",
  "badge-in": "pop",
  "count-out-up": "roll",
  "count-out-down": "roll",
};

/** The view after the animation `animationName` ended: that part is at rest, so a re-shown page never replays it. */
export function settleBellView(view: BellView, animationName: string): BellView {
  const part = ENDS[animationName];
  if (part === undefined || !view[part]) return view;
  return part === "ring" ? { ...view, ring: false } : { ...view, [part]: null };
}

const browserEnv: BellMotionEnv = {
  now: () => Date.now(),
  isVisible: () => typeof document === "undefined" || document.visibilityState === "visible",
  reducedMotion: () =>
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  onVisibilityChange(listener) {
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
};

/** The cues the stream (notification-stream.tsx) gives and the bell (bell.tsx) plays. */
export const bellMotion = createBellMotion(browserEnv);
