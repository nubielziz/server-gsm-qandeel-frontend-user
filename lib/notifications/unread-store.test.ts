import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { createUnreadStore, MAX_BACKOFF_MS, POLL_INTERVAL_MS, UNREAD_CAP, type UnreadEnv } from "./unread-store";

/** A fake browser: a visibility switch and a count source that tests script. */
function fakeEnv(options: { visible?: boolean } = {}) {
  let visible = options.visible ?? true;
  const listeners = new Set<() => void>();
  const fetchCount = vi.fn<UnreadEnv["fetchCount"]>(async () => 3);
  const env: UnreadEnv = {
    fetchCount,
    isVisible: () => visible,
    onVisibilityChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    env,
    fetchCount,
    visibilityListeners: () => listeners.size,
    setVisible(next: boolean) {
      visible = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

const minute = POLL_INTERVAL_MS;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("polling", () => {
  it("polls at once when the server gave no count, then once a minute", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    const stop = store.subscribe("customer", () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot("customer")).toBe(3);

    await vi.advanceTimersByTimeAsync(minute - 1);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCount).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(minute);
    expect(fetchCount).toHaveBeenCalledTimes(3);
    stop();
  });

  it("does not ask when a seed follows the subscription in the same tick (the bell's own order)", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    const stop = store.subscribe("customer", () => {});
    store.seed("customer", 2);
    await vi.advanceTimersByTimeAsync(minute - 1);
    expect(fetchCount).not.toHaveBeenCalled();
    expect(store.getSnapshot("customer")).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not poll right after the server's count (a seed starts the minute)", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("customer", 5);
    const stop = store.subscribe("customer", () => {});
    await vi.advanceTimersByTimeAsync(minute - 1);
    expect(fetchCount).not.toHaveBeenCalled();
    expect(store.getSnapshot("customer")).toBe(5);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not poll while the tab is hidden, and polls when it comes back once the minute has passed", async () => {
    const { env, fetchCount, setVisible } = fakeEnv({ visible: false });
    const store = createUnreadStore(env);
    const stop = store.subscribe("customer", () => {});
    await vi.advanceTimersByTimeAsync(10 * minute);
    expect(fetchCount).not.toHaveBeenCalled();

    setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toHaveBeenCalledTimes(1);

    // Hidden again: the countdown stops, nothing is asked.
    setVisible(false);
    await vi.advanceTimersByTimeAsync(5 * minute);
    expect(fetchCount).toHaveBeenCalledTimes(1);

    // Back after more than a minute: one poll at once.
    setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toHaveBeenCalledTimes(2);
    stop();
  });

  it("waits for the rest of the minute when the tab comes back early", async () => {
    const { env, fetchCount, setVisible } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("customer", 1);
    const stop = store.subscribe("customer", () => {});
    await vi.advanceTimersByTimeAsync(20_000);
    setVisible(false);
    setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(minute - 20_000);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stops polling and drops the visibility listener with the last subscriber", async () => {
    const { env, fetchCount, visibilityListeners } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("customer", 1);
    const stopFirst = store.subscribe("customer", () => {});
    const stopSecond = store.subscribe("customer", () => {});
    expect(visibilityListeners()).toBe(1);
    stopFirst();
    expect(visibilityListeners()).toBe(1);
    stopSecond();
    expect(visibilityListeners()).toBe(0);
    await vi.advanceTimersByTimeAsync(5 * minute);
    expect(fetchCount).not.toHaveBeenCalled();
  });

  it("keeps the two surfaces apart", async () => {
    const { env, fetchCount } = fakeEnv();
    fetchCount.mockImplementation(async (surface) => (surface === "merchant" ? 7 : 2));
    const store = createUnreadStore(env);
    const stop = store.subscribe("merchant", () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toHaveBeenCalledWith("merchant");
    expect(fetchCount).not.toHaveBeenCalledWith("customer");
    expect(store.getSnapshot("merchant")).toBe(7);
    expect(store.getSnapshot("customer")).toBeNull();
    stop();
  });
});

describe("refresh after an action", () => {
  it("asks at once, inside the minute, and tells the listeners", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("customer", 4);
    const listener = vi.fn();
    const stop = store.subscribe("customer", listener);
    fetchCount.mockResolvedValueOnce(0);

    await store.refresh("customer");
    expect(fetchCount).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot("customer")).toBe(0);
    expect(listener).toHaveBeenCalled();

    // The next poll comes a minute after the refresh, not a minute after the seed.
    await vi.advanceTimersByTimeAsync(minute - 1);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCount).toHaveBeenCalledTimes(2);
    stop();
  });

  it("never runs two requests at once: a second action waits and asks again once", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("customer", 5);
    let finishFirst: (n: number) => void = () => {};
    fetchCount.mockImplementationOnce(() => new Promise<number>((resolve) => (finishFirst = resolve)));
    fetchCount.mockResolvedValueOnce(1);

    const first = store.refresh("customer");
    const second = store.refresh("customer");
    const third = store.refresh("customer");
    expect(fetchCount).toHaveBeenCalledTimes(1);
    finishFirst(3);
    await Promise.all([first, second, third]);
    expect(fetchCount).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot("customer")).toBe(1);
  });

  it("does nothing while the tab is hidden for a poll, but an action still asks", async () => {
    const { env, fetchCount } = fakeEnv({ visible: false });
    const store = createUnreadStore(env);
    store.seed("customer", 2);
    await store.refresh("customer");
    expect(fetchCount).toHaveBeenCalledTimes(1);
  });
});

describe("reconcile (a count a server render brought)", () => {
  it("seeds when the store has no count yet, with no request", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    const stop = store.subscribe("customer", () => {});
    store.reconcile("customer", 5);
    await vi.advanceTimersByTimeAsync(minute - 1);
    expect(store.getSnapshot("customer")).toBe(5);
    expect(fetchCount).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    stop();
  });

  it("never overwrites a newer read: a stale count that differs makes the store ask again", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    const stop = store.subscribe("customer", () => {});
    store.seed("customer", 2);
    fetchCount.mockResolvedValue(0);
    await store.refresh("customer");
    expect(store.getSnapshot("customer")).toBe(0);
    expect(fetchCount).toHaveBeenCalledTimes(1);

    // A router.refresh that read the API before the action lands late with the old number.
    store.reconcile("customer", 1);
    expect(store.getSnapshot("customer")).toBe(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot("customer")).toBe(0);

    // The same count as the store's own asks nothing.
    store.reconcile("customer", 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toHaveBeenCalledTimes(2);
    stop();
  });

  it("takes the API's answer when the server count differs and the API agrees with the server", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    const stop = store.subscribe("customer", () => {});
    store.seed("customer", 1);
    fetchCount.mockResolvedValue(4);
    store.reconcile("customer", 4);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot("customer")).toBe(4);
    stop();
  });

  it("compares the capped count (250 from a server is 100)", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("customer", 100);
    store.reconcile("customer", 250);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).not.toHaveBeenCalled();
    expect(store.getSnapshot("customer")).toBe(UNREAD_CAP);
  });

  it("is a seed after a stop (the session works again)", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("customer", 2);
    const stop = store.subscribe("customer", () => {});
    fetchCount.mockRejectedValueOnce(new ApiError({ status: 401, code: "UNAUTHORIZED" }));
    await store.refresh("customer");
    expect(fetchCount).toHaveBeenCalledTimes(1);

    store.reconcile("customer", 9);
    expect(store.getSnapshot("customer")).toBe(9);
    await vi.advanceTimersByTimeAsync(minute);
    expect(fetchCount).toHaveBeenCalledTimes(2);
    stop();
  });

  it("does not ask during a 429 wait", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("customer", 1);
    const stop = store.subscribe("customer", () => {});
    fetchCount.mockRejectedValueOnce(new ApiError({ status: 429, code: "RATE_LIMITED", retryAfter: 300 }));
    await store.refresh("customer");
    store.reconcile("customer", 3);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot("customer")).toBe(1);
    stop();
  });
});

describe("counts", () => {
  it("caps the count at 100 and never goes below 0", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    fetchCount.mockResolvedValueOnce(250);
    await store.refresh("customer");
    expect(store.getSnapshot("customer")).toBe(UNREAD_CAP);
    store.seed("customer", -3);
    expect(store.getSnapshot("customer")).toBe(0);
    store.seed("customer", 100);
    expect(store.getSnapshot("customer")).toBe(100);
  });

  it("does not notify when the count did not change", async () => {
    const { env } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("customer", 3);
    const listener = vi.fn();
    const stop = store.subscribe("customer", listener);
    store.seed("customer", 3);
    expect(listener).not.toHaveBeenCalled();
    store.seed("customer", 4);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it("ignores an answer that is not a number and keeps the last count", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("customer", 6);
    fetchCount.mockResolvedValueOnce(undefined as unknown as number);
    await store.refresh("customer");
    expect(store.getSnapshot("customer")).toBe(6);
  });
});

describe("failures", () => {
  it("stops for good after a 401", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("customer", 2);
    const stop = store.subscribe("customer", () => {});
    fetchCount.mockRejectedValueOnce(new ApiError({ status: 401, code: "UNAUTHORIZED" }));

    await store.refresh("customer");
    expect(fetchCount).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot("customer")).toBe(2);

    await vi.advanceTimersByTimeAsync(30 * minute);
    await store.refresh("customer");
    expect(fetchCount).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stops for good after ACCOUNT_SUSPENDED and IP_NOT_ALLOWED (403)", async () => {
    for (const code of ["ACCOUNT_SUSPENDED", "IP_NOT_ALLOWED"]) {
      const { env, fetchCount } = fakeEnv();
      const store = createUnreadStore(env);
      fetchCount.mockRejectedValueOnce(new ApiError({ status: 403, code }));
      const stop = store.subscribe("merchant", () => {});
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30 * minute);
      expect(fetchCount, code).toHaveBeenCalledTimes(1);
      stop();
    }
  });

  it("starts again when the server renders a count (the session works)", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    fetchCount.mockRejectedValueOnce(new ApiError({ status: 401, code: "UNAUTHORIZED" }));
    const stop = store.subscribe("customer", () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toHaveBeenCalledTimes(1);

    store.seed("customer", 9);
    await vi.advanceTimersByTimeAsync(minute);
    expect(fetchCount).toHaveBeenCalledTimes(2);
    stop();
  });

  it("waits for Retry-After after a 429, and not less than a minute", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("customer", 1);
    const stop = store.subscribe("customer", () => {});
    fetchCount.mockRejectedValueOnce(new ApiError({ status: 429, code: "RATE_LIMITED", retryAfter: 300 }));
    await store.refresh("customer");
    expect(fetchCount).toHaveBeenCalledTimes(1);

    // An action during the wait does not ask either.
    await store.refresh("customer");
    expect(fetchCount).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(300_000 - 1);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCount).toHaveBeenCalledTimes(2);

    fetchCount.mockRejectedValueOnce(new ApiError({ status: 429, code: "RATE_LIMITED", retryAfter: 5 }));
    await vi.advanceTimersByTimeAsync(minute);
    expect(fetchCount).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(minute - 1);
    expect(fetchCount).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCount).toHaveBeenCalledTimes(4);
    stop();
  });

  it("never waits longer than the cap after a 429", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("customer", 1);
    const stop = store.subscribe("customer", () => {});
    fetchCount.mockRejectedValueOnce(new ApiError({ status: 429, code: "RATE_LIMITED", retryAfter: 86_400 }));
    await store.refresh("customer");
    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
    expect(fetchCount).toHaveBeenCalledTimes(2);
    stop();
  });

  it("keeps the count and backs off after a network failure", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("customer", 8);
    const stop = store.subscribe("customer", () => {});
    fetchCount.mockRejectedValueOnce(new ApiError({ status: 0, code: "NETWORK_ERROR" }));
    fetchCount.mockRejectedValueOnce(new ApiError({ status: 503, code: "UNAVAILABLE" }));
    fetchCount.mockResolvedValue(2);

    await vi.advanceTimersByTimeAsync(minute); // poll 1 fails
    expect(fetchCount).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot("customer")).toBe(8);

    await vi.advanceTimersByTimeAsync(minute); // retry after a minute; poll 2 fails
    expect(fetchCount).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot("customer")).toBe(8);

    await vi.advanceTimersByTimeAsync(2 * minute - 1); // the second failure doubles the wait
    expect(fetchCount).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCount).toHaveBeenCalledTimes(3);
    expect(store.getSnapshot("customer")).toBe(2);

    await vi.advanceTimersByTimeAsync(minute); // success: back to the normal minute
    expect(fetchCount).toHaveBeenCalledTimes(4);
    stop();
  });
});
