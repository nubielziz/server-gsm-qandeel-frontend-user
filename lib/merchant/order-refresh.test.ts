// How an open order's page keeps itself fresh (lib/merchant/order-refresh.ts), with fake timers.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CANCEL_DEADLINE_GRACE_MS,
  OPEN_ORDER_REFRESH_MS,
  holdOrderRefresh,
  isOpenOrder,
  orderRefreshHeld,
  realClock,
  watchOrder,
} from "./order-refresh";

const T0 = Date.parse("2026-11-27T10:00:00.000Z");
const at = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

/** The browser's clock with a tab the test can hide. */
const tab = { visible: true };
const clock = { ...realClock, visible: () => tab.visible };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  tab.visible = true;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("isOpenOrder", () => {
  it("is false only for a completed or a rejected order", () => {
    expect(isOpenOrder("pending")).toBe(true);
    expect(isOpenOrder("processing")).toBe(true);
    expect(isOpenOrder("completed")).toBe(false);
    expect(isOpenOrder("rejected")).toBe(false);
  });
});

describe("holdOrderRefresh", () => {
  it("holds while a button of the page has a modal open or a request running, and lets go when each has", () => {
    expect(orderRefreshHeld()).toBe(false);
    const first = holdOrderRefresh();
    const second = holdOrderRefresh();
    expect(orderRefreshHeld()).toBe(true);
    first();
    expect(orderRefreshHeld()).toBe(true);
    second();
    expect(orderRefreshHeld()).toBe(false);
  });

  it("counts a release once, however often it is called", () => {
    const first = holdOrderRefresh();
    const second = holdOrderRefresh();
    first();
    first();
    expect(orderRefreshHeld()).toBe(true);
    second();
    expect(orderRefreshHeld()).toBe(false);
  });
});

describe("watchOrder: the 30-second refresh of an open order", () => {
  it("refreshes every 30 seconds while the order is open", () => {
    const refresh = vi.fn();
    const stop = watchOrder({ refresh, open: true, clock });
    vi.advanceTimersByTime(OPEN_ORDER_REFRESH_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(OPEN_ORDER_REFRESH_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(3);
    stop();
  });

  it("does not poll a final order", () => {
    const refresh = vi.fn();
    const stop = watchOrder({ refresh, open: false, clock });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(OPEN_ORDER_REFRESH_MS * 5);
    expect(refresh).not.toHaveBeenCalled();
    stop();
  });

  it("skips the ticks while the tab is hidden and goes on when it is shown again", () => {
    const refresh = vi.fn();
    const stop = watchOrder({ refresh, open: true, clock });
    tab.visible = false;
    vi.advanceTimersByTime(OPEN_ORDER_REFRESH_MS * 3);
    expect(refresh).not.toHaveBeenCalled();
    tab.visible = true;
    vi.advanceTimersByTime(OPEN_ORDER_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
  });

  it("skips the ticks while a modal is open or a request runs", () => {
    const refresh = vi.fn();
    const stop = watchOrder({ refresh, open: true, clock });
    const release = holdOrderRefresh();
    vi.advanceTimersByTime(OPEN_ORDER_REFRESH_MS * 2);
    expect(refresh).not.toHaveBeenCalled();
    release();
    vi.advanceTimersByTime(OPEN_ORDER_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stops for good, and its timers are gone, when the page goes away", () => {
    const refresh = vi.fn();
    const stop = watchOrder({ refresh, open: true, cancelUntil: at(60_000), clock });
    expect(vi.getTimerCount()).toBe(2);
    stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(OPEN_ORDER_REFRESH_MS * 5);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("watchOrder: the refresh when the cancel window ends", () => {
  it("refreshes once, a moment after the deadline (the order is sent then), and not again", () => {
    const refresh = vi.fn();
    const stop = watchOrder({ refresh, open: false, cancelUntil: at(10_000), clock });
    vi.advanceTimersByTime(10_000 + CANCEL_DEADLINE_GRACE_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(OPEN_ORDER_REFRESH_MS * 5);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });

  it("refreshes at once for a deadline that has passed already (the page was drawn from an old answer)", () => {
    const refresh = vi.fn();
    const stop = watchOrder({ refresh, open: false, cancelUntil: at(-60_000), clock });
    vi.advanceTimersByTime(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not refresh while a modal is open or a request runs: the next poll or the visitor's own answer catches up", () => {
    const refresh = vi.fn();
    const stop = watchOrder({ refresh, open: true, cancelUntil: at(10_000), clock });
    const release = holdOrderRefresh();
    vi.advanceTimersByTime(OPEN_ORDER_REFRESH_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    release();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
  });

  it("never refreshes after it is stopped", () => {
    const refresh = vi.fn();
    const stop = watchOrder({ refresh, open: false, cancelUntil: at(10_000), clock });
    stop();
    vi.advanceTimersByTime(60_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("ignores a missing or an unreadable deadline", () => {
    for (const cancelUntil of [null, undefined, "", "soon"]) {
      const refresh = vi.fn();
      const stop = watchOrder({ refresh, open: false, cancelUntil, clock });
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(60_000);
      expect(refresh).not.toHaveBeenCalled();
      stop();
    }
  });
});
