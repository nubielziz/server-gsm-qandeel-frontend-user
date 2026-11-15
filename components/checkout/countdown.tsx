"use client";
// The checkout session's countdown ("Price locked for 12:34"), as a leaf: only this text re-renders every second, not the
// whole review-and-pay page (plan P4.3). The page hears about the clock once, when it reaches zero (`onExpire`).
import { useEffect, useEffectEvent, useSyncExternalStore } from "react";
import { fmt } from "@/lib/i18n/define";

// ── A clock that ticks once a second for every subscriber (no setState in effects, no drift between components).
let nowSeconds = Math.floor(Date.now() / 1000);
const tickListeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | undefined;

function subscribeTick(listener: () => void): () => void {
  tickListeners.add(listener);
  nowSeconds = Math.floor(Date.now() / 1000);
  tickTimer ??= setInterval(() => {
    nowSeconds = Math.floor(Date.now() / 1000);
    tickListeners.forEach((l) => l());
  }, 1000);
  return () => {
    tickListeners.delete(listener);
    if (tickListeners.size === 0 && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = undefined;
    }
  };
}

/** The current time in whole seconds, or null on the server and while hydrating (the clock then shows `--:--`). */
const useNowSeconds = () => useSyncExternalStore(subscribeTick, () => nowSeconds, () => null);

/**
 * `mm:ss` of a number of seconds (`75` → `01:15`).
 * @param totalSeconds Whole seconds, 0 or more.
 * @returns The two-digit minutes and seconds.
 */
export function clock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Whole seconds until `expiresAt`, rounded up and never below 0.
 * @param expiresAt The session's `expiresAt` (ISO date-time).
 * @param now The current time in seconds, or null before the client clock is known.
 * @returns The seconds left (0 once it has passed), or null when `now` is null.
 */
export function secondsLeftAt(expiresAt: string, now: number | null): number | null {
  return now === null ? null : Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now * 1000) / 1000));
}

/**
 * Calls `onExpire` once, on the shared one-second clock, when `expiresAt` is reached: at once when it has already passed,
 * otherwise at the first tick with no second left. It then stops listening.
 * @param expiresAt The session's `expiresAt` (ISO date-time).
 * @param onExpire Called at most once.
 * @returns Stops the watch (an effect's cleanup); `onExpire` is not called after it.
 */
export function watchExpiry(expiresAt: string, onExpire: () => void): () => void {
  let done = false;
  const check = () => {
    if (done || secondsLeftAt(expiresAt, nowSeconds) !== 0) return;
    done = true;
    unsubscribe();
    onExpire();
  };
  const unsubscribe = subscribeTick(check);
  check();
  return () => {
    done = true;
    unsubscribe();
  };
}

export type CountdownProps = {
  /** The session's `expiresAt` (ISO date-time). */
  expiresAt: string;
  /** Called once when the time is up (also at once when it was already up on the first client render). */
  onExpire: () => void;
  /** The translated text with a `{time}` placeholder (`checkout.session.timer`), filled with `mm:ss` or `--:--`. */
  template: string;
};

/**
 * The time left on a checkout session, ticking once a second. Renders `--:--` on the server and while hydrating (the
 * server's clock is not the visitor's), then `mm:ss`.
 */
export function Countdown({ expiresAt, onExpire, template }: CountdownProps) {
  const left = secondsLeftAt(expiresAt, useNowSeconds());
  const expire = useEffectEvent(onExpire);
  useEffect(() => watchExpiry(expiresAt, () => expire()), [expiresAt]);
  return <span>{fmt(template, { time: left === null ? "--:--" : clock(left) })}</span>;
}
