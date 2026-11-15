import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRefreshScheduler, needsRefresh, REFRESH_COLLECT_MS, REFRESH_MIN_GAP_MS } from "./refresh-scheduler";

function setup() {
  const run = vi.fn();
  const scheduler = createRefreshScheduler({
    run,
    timers: { setTimeout: (callback, ms) => setTimeout(callback, ms), clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>), now: () => Date.now() },
  });
  return { run, scheduler };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("refresh scheduler", () => {
  it("collects events for 400 ms and refreshes once", () => {
    const { run, scheduler } = setup();
    scheduler.request();
    vi.advanceTimersByTime(300);
    scheduler.request();
    scheduler.request();
    vi.advanceTimersByTime(REFRESH_COLLECT_MS - 300 - 1);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("refreshes at most once every 2 s, however steady the events", () => {
    const { run, scheduler } = setup();
    const times: number[] = [];
    run.mockImplementation(() => times.push(Date.now()));
    for (let i = 0; i < 60; i++) {
      scheduler.request();
      vi.advanceTimersByTime(100);
    }
    vi.advanceTimersByTime(5_000);
    expect(times.length).toBeGreaterThan(2);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(REFRESH_MIN_GAP_MS);
  });

  it("dispose cancels a pending refresh", () => {
    const { run, scheduler } = setup();
    scheduler.request();
    scheduler.dispose();
    vi.advanceTimersByTime(5_000);
    expect(run).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("needsRefresh", () => {
  const none = { always: false, all: false, readIds: new Set<number>() };

  it("a new item always does", () => {
    expect(needsRefresh({ ...none, always: true }, new Set())).toBe(true);
  });

  it("a read event matters only for an item still shown as unread", () => {
    expect(needsRefresh({ ...none, readIds: new Set([5]) }, new Set([4, 5]))).toBe(true);
    expect(needsRefresh({ ...none, readIds: new Set([6]) }, new Set([4, 5]))).toBe(false);
    expect(needsRefresh({ ...none, readIds: new Set([5]) }, new Set())).toBe(false);
  });

  it("read-all matters when anything unread is on screen", () => {
    expect(needsRefresh({ ...none, all: true }, new Set([1]))).toBe(true);
    expect(needsRefresh({ ...none, all: true }, new Set())).toBe(false);
  });
});
