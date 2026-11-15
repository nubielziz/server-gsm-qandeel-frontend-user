import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Countdown, clock, secondsLeftAt, watchExpiry } from "./countdown";

// A whole second, so the clock's floor to seconds does not move the expected tick.
const T0 = Date.parse("2026-11-15T10:00:00.000Z");
const at = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

describe("clock", () => {
  it("writes minutes and seconds with two digits", () => {
    expect(clock(0)).toBe("00:00");
    expect(clock(75)).toBe("01:15");
    expect(clock(30 * 60)).toBe("30:00");
  });
});

describe("secondsLeftAt", () => {
  it("is null until the client clock is known", () => {
    expect(secondsLeftAt(at(60_000), null)).toBeNull();
  });

  it("rounds a part of a second up and never goes below zero", () => {
    expect(secondsLeftAt(at(2_500), T0 / 1000)).toBe(3);
    expect(secondsLeftAt(at(0), T0 / 1000)).toBe(0);
    expect(secondsLeftAt(at(-90_000), T0 / 1000)).toBe(0);
  });
});

describe("watchExpiry: the expiry callback of the countdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onExpire once, at the tick where no second is left, and then stops the clock", () => {
    const onExpire = vi.fn();
    const stop = watchExpiry(at(3_000), onExpire);
    vi.advanceTimersByTime(2_999);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    // Its only listener is gone, so the shared interval is cleared too.
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });

  it("calls onExpire at once when the session had already run out", () => {
    const onExpire = vi.fn();
    const stop = watchExpiry(at(-5_000), onExpire);
    expect(onExpire).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    stop();
  });

  it("never calls onExpire after the watch is stopped (the countdown unmounted)", () => {
    const onExpire = vi.fn();
    const stop = watchExpiry(at(3_000), onExpire);
    vi.advanceTimersByTime(1_000);
    stop();
    vi.advanceTimersByTime(10_000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shares one interval between watches, and each fires at its own time", () => {
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = watchExpiry(at(2_000), first);
    const stopSecond = watchExpiry(at(4_000), second);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(2_000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(second).toHaveBeenCalledTimes(1);
    stopFirst();
    stopSecond();
  });
});

describe("Countdown: what the server draws", () => {
  it("shows --:-- until the visitor's clock is known (the server's clock is not theirs)", () => {
    const html = renderToStaticMarkup(<Countdown expiresAt={at(60_000)} onExpire={() => {}} template="Price locked for {time}" />);
    expect(html).toBe("<span>Price locked for --:--</span>");
  });
});
