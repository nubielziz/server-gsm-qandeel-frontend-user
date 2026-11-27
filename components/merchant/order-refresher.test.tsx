// The component that keeps an open order's page fresh (components/merchant/order-refresher.tsx): what it hands the watcher.
// There is no DOM in these tests, so `useEffect` is a stand-in that runs the effect at once and keeps its cleanup.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rt = vi.hoisted(() => ({ cleanups: [] as Array<() => void>, refresh: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: (run: () => unknown) => {
    const cleanup = run();
    if (typeof cleanup === "function") rt.cleanups.push(cleanup as () => void);
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: rt.refresh }) }));

import { CANCEL_DEADLINE_GRACE_MS, OPEN_ORDER_REFRESH_MS } from "@/lib/merchant/order-refresh";
import { OrderRefresher } from "./order-refresher";

const T0 = Date.parse("2026-11-27T10:00:00.000Z");

/** Mounts the component: it draws nothing, so what is returned is its markup (empty) and what it started is in the timers. */
const mount = (props: { status: string; cancelUntil?: string | null }) => OrderRefresher(props);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  rt.refresh.mockClear();
});
afterEach(() => {
  for (const cleanup of rt.cleanups.splice(0)) cleanup();
  vi.useRealTimers();
});

describe("OrderRefresher", () => {
  it("draws nothing", () => {
    expect(mount({ status: "processing" })).toBeNull();
  });

  it("an open order refreshes the page every 30 seconds", () => {
    for (const status of ["pending", "processing"]) {
      mount({ status });
      vi.advanceTimersByTime(OPEN_ORDER_REFRESH_MS * 2);
      expect(rt.refresh, status).toHaveBeenCalledTimes(2);
      for (const cleanup of rt.cleanups.splice(0)) cleanup();
      rt.refresh.mockClear();
    }
  });

  it("a final order is not polled", () => {
    for (const status of ["completed", "rejected"]) {
      mount({ status });
      vi.advanceTimersByTime(OPEN_ORDER_REFRESH_MS * 3);
    }
    expect(rt.refresh).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refreshes once when the cancel window has passed", () => {
    mount({ status: "completed", cancelUntil: new Date(T0 + 90_000).toISOString() });
    vi.advanceTimersByTime(90_000 + CANCEL_DEADLINE_GRACE_MS - 1);
    expect(rt.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(rt.refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(OPEN_ORDER_REFRESH_MS * 3);
    expect(rt.refresh).toHaveBeenCalledTimes(1);
  });

  it("stops everything when the page is left", () => {
    mount({ status: "processing", cancelUntil: new Date(T0 + 90_000).toISOString() });
    expect(vi.getTimerCount()).toBe(2);
    for (const cleanup of rt.cleanups.splice(0)) cleanup();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(OPEN_ORDER_REFRESH_MS * 5);
    expect(rt.refresh).not.toHaveBeenCalled();
  });
});
