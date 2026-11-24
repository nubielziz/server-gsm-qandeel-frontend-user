"use client";
// The bell's two browser hooks (owner, 2026-11-15): what the bell plays now (the swing, the pop, the rolling number; the
// rules are in lib/notifications/bell-motion.ts) and the "(n) " prefix of the hidden tab's title
// (lib/notifications/title-badge.ts). Used by bell.tsx only.
import { useCallback, useEffect, useState, useSyncExternalStore, type AnimationEvent } from "react";
import {
  bellMotion,
  IDLE_MOTION,
  initialBellView,
  nextBellView,
  settleBellView,
  type BellView,
} from "@/lib/notifications/bell-motion";
import type { AccountFamily } from "@/lib/account/family";
import { titleBadge } from "@/lib/notifications/title-badge";

/**
 * What the bell of `family` plays for the count on screen. `onAnimationEnd` goes on the bell's root: the swing, the pop
 * and the roll bubble up to it, and each one that ends is set at rest (no timer).
 */
export function useBellMotion(
  family: AccountFamily,
  count: number,
  text: string,
): {
  view: BellView;
  onAnimationEnd: (event: AnimationEvent<HTMLElement>) => void;
  /** Sets one motion at rest by its name (the swing is played with the Web Animations API, which fires no animationend). */
  settle: (name: string) => void;
} {
  const subscribe = useCallback((listener: () => void) => bellMotion.subscribe(family, listener), [family]);
  const motion = useSyncExternalStore(subscribe, () => bellMotion.getSnapshot(family), () => IDLE_MOTION);
  const [view, setView] = useState(() => initialBellView(count, text, motion));
  // The previous render's view is kept in state and moved on during render (React's "storing information from previous
  // renders"): only when something changed, so this never loops.
  const next = nextBellView(view, count, text, motion);
  if (next !== view) setView(next);
  const onAnimationEnd = useCallback((event: AnimationEvent<HTMLElement>) => {
    const name = event.animationName;
    setView((current) => settleBellView(current, name));
  }, []);
  const settle = useCallback((name: string) => setView((current) => settleBellView(current, name)), []);
  return { view: next, onAnimationEnd, settle };
}

/** Registers this bell's count for the hidden tab's title prefix; the registration ends with the bell. */
export function useTitleBadge(count: number, text: string): void {
  const [owner] = useState(() => ({}));
  useEffect(() => {
    titleBadge.set(owner, count, text);
  }, [owner, count, text]);
  useEffect(() => () => titleBadge.remove(owner), [owner]);
}
