import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { createUnreadStore, LIVE_POLL_INTERVAL_MS, MAX_BACKOFF_MS, POLL_INTERVAL_MS, UNREAD_CAP, type UnreadEnv } from "./unread-store";

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
    const stop = store.subscribe("store", () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot("store")).toBe(3);

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
    const stop = store.subscribe("store", () => {});
    store.seed("store", 2);
    await vi.advanceTimersByTimeAsync(minute - 1);
    expect(fetchCount).not.toHaveBeenCalled();
    expect(store.getSnapshot("store")).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not poll right after the server's count (a seed starts the minute)", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("store", 5);
    const stop = store.subscribe("store", () => {});
    await vi.advanceTimersByTimeAsync(minute - 1);
    expect(fetchCount).not.toHaveBeenCalled();
    expect(store.getSnapshot("store")).toBe(5);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not poll while the tab is hidden, and polls when it comes back once the minute has passed", async () => {
    const { env, fetchCount, setVisible } = fakeEnv({ visible: false });
    const store = createUnreadStore(env);
    const stop = store.subscribe("store", () => {});
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
    store.seed("store", 1);
    const stop = store.subscribe("store", () => {});
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
    store.seed("store", 1);
    const stopFirst = store.subscribe("store", () => {});
    const stopSecond = store.subscribe("store", () => {});
    expect(visibilityListeners()).toBe(1);
    stopFirst();
    expect(visibilityListeners()).toBe(1);
    stopSecond();
    expect(visibilityListeners()).toBe(0);
    await vi.advanceTimersByTimeAsync(5 * minute);
    expect(fetchCount).not.toHaveBeenCalled();
  });

  it("keeps the two families apart", async () => {
    const { env, fetchCount } = fakeEnv();
    fetchCount.mockImplementation(async (family) => (family === "client" ? 7 : 2));
    const store = createUnreadStore(env);
    const stop = store.subscribe("client", () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toHaveBeenCalledWith("client");
    expect(fetchCount).not.toHaveBeenCalledWith("store");
    expect(store.getSnapshot("client")).toBe(7);
    expect(store.getSnapshot("store")).toBeNull();
    stop();
  });
});

describe("refresh after an action", () => {
  it("asks at once, inside the minute, and tells the listeners", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("store", 4);
    const listener = vi.fn();
    const stop = store.subscribe("store", listener);
    fetchCount.mockResolvedValueOnce(0);

    await store.refresh("store");
    expect(fetchCount).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot("store")).toBe(0);
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
    store.seed("store", 5);
    let finishFirst: (n: number) => void = () => {};
    fetchCount.mockImplementationOnce(() => new Promise<number>((resolve) => (finishFirst = resolve)));
    fetchCount.mockResolvedValueOnce(1);

    const first = store.refresh("store");
    const second = store.refresh("store");
    const third = store.refresh("store");
    expect(fetchCount).toHaveBeenCalledTimes(1);
    finishFirst(3);
    await Promise.all([first, second, third]);
    expect(fetchCount).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot("store")).toBe(1);
  });

  it("does nothing while the tab is hidden for a poll, but an action still asks", async () => {
    const { env, fetchCount } = fakeEnv({ visible: false });
    const store = createUnreadStore(env);
    store.seed("store", 2);
    await store.refresh("store");
    expect(fetchCount).toHaveBeenCalledTimes(1);
  });
});

describe("reconcile (a count a server render brought)", () => {
  it("seeds when the store has no count yet, with no request", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    const stop = store.subscribe("store", () => {});
    store.reconcile("store", 5);
    await vi.advanceTimersByTimeAsync(minute - 1);
    expect(store.getSnapshot("store")).toBe(5);
    expect(fetchCount).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    stop();
  });

  it("never overwrites a newer read: a stale count that differs makes the store ask again", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    const stop = store.subscribe("store", () => {});
    store.seed("store", 2);
    fetchCount.mockResolvedValue(0);
    await store.refresh("store");
    expect(store.getSnapshot("store")).toBe(0);
    expect(fetchCount).toHaveBeenCalledTimes(1);

    // A router.refresh that read the API before the action lands late with the old number.
    store.reconcile("store", 1);
    expect(store.getSnapshot("store")).toBe(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot("store")).toBe(0);

    // The same count as the store's own asks nothing.
    store.reconcile("store", 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toHaveBeenCalledTimes(2);
    stop();
  });

  it("takes the API's answer when the server count differs and the API agrees with the server", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    const stop = store.subscribe("store", () => {});
    store.seed("store", 1);
    fetchCount.mockResolvedValue(4);
    store.reconcile("store", 4);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot("store")).toBe(4);
    stop();
  });

  it("compares the capped count (250 from a server is 100)", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("store", 100);
    store.reconcile("store", 250);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).not.toHaveBeenCalled();
    expect(store.getSnapshot("store")).toBe(UNREAD_CAP);
  });

  it("is a seed after a stop (the session works again)", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("store", 2);
    const stop = store.subscribe("store", () => {});
    fetchCount.mockRejectedValueOnce(new ApiError({ status: 401, code: "UNAUTHORIZED" }));
    await store.refresh("store");
    expect(fetchCount).toHaveBeenCalledTimes(1);

    store.reconcile("store", 9);
    expect(store.getSnapshot("store")).toBe(9);
    await vi.advanceTimersByTimeAsync(minute);
    expect(fetchCount).toHaveBeenCalledTimes(2);
    stop();
  });

  it("does not ask during a 429 wait", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("store", 1);
    const stop = store.subscribe("store", () => {});
    fetchCount.mockRejectedValueOnce(new ApiError({ status: 429, code: "RATE_LIMITED", retryAfter: 300 }));
    await store.refresh("store");
    store.reconcile("store", 3);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot("store")).toBe(1);
    stop();
  });
});

describe("counts", () => {
  it("caps the count at 100 and never goes below 0", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    fetchCount.mockResolvedValueOnce(250);
    await store.refresh("store");
    expect(store.getSnapshot("store")).toBe(UNREAD_CAP);
    store.seed("store", -3);
    expect(store.getSnapshot("store")).toBe(0);
    store.seed("store", 100);
    expect(store.getSnapshot("store")).toBe(100);
  });

  it("does not notify when the count did not change", async () => {
    const { env } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("store", 3);
    const listener = vi.fn();
    const stop = store.subscribe("store", listener);
    store.seed("store", 3);
    expect(listener).not.toHaveBeenCalled();
    store.seed("store", 4);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it("ignores an answer that is not a number and keeps the last count", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("store", 6);
    fetchCount.mockResolvedValueOnce(undefined as unknown as number);
    await store.refresh("store");
    expect(store.getSnapshot("store")).toBe(6);
  });
});

describe("failures", () => {
  it("stops for good after a 401", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("store", 2);
    const stop = store.subscribe("store", () => {});
    fetchCount.mockRejectedValueOnce(new ApiError({ status: 401, code: "UNAUTHORIZED" }));

    await store.refresh("store");
    expect(fetchCount).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot("store")).toBe(2);

    await vi.advanceTimersByTimeAsync(30 * minute);
    await store.refresh("store");
    expect(fetchCount).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stops for good after ACCOUNT_SUSPENDED and IP_NOT_ALLOWED (403)", async () => {
    for (const code of ["ACCOUNT_SUSPENDED", "IP_NOT_ALLOWED"]) {
      const { env, fetchCount } = fakeEnv();
      const store = createUnreadStore(env);
      fetchCount.mockRejectedValueOnce(new ApiError({ status: 403, code }));
      const stop = store.subscribe("client", () => {});
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
    const stop = store.subscribe("store", () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toHaveBeenCalledTimes(1);

    store.seed("store", 9);
    await vi.advanceTimersByTimeAsync(minute);
    expect(fetchCount).toHaveBeenCalledTimes(2);
    stop();
  });

  it("waits for Retry-After after a 429, and not less than a minute", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("store", 1);
    const stop = store.subscribe("store", () => {});
    fetchCount.mockRejectedValueOnce(new ApiError({ status: 429, code: "RATE_LIMITED", retryAfter: 300 }));
    await store.refresh("store");
    expect(fetchCount).toHaveBeenCalledTimes(1);

    // An action during the wait does not ask either.
    await store.refresh("store");
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
    store.seed("store", 1);
    const stop = store.subscribe("store", () => {});
    fetchCount.mockRejectedValueOnce(new ApiError({ status: 429, code: "RATE_LIMITED", retryAfter: 86_400 }));
    await store.refresh("store");
    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
    expect(fetchCount).toHaveBeenCalledTimes(2);
    stop();
  });

  it("keeps the count and backs off after a network failure", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("store", 8);
    const stop = store.subscribe("store", () => {});
    fetchCount.mockRejectedValueOnce(new ApiError({ status: 0, code: "NETWORK_ERROR" }));
    fetchCount.mockRejectedValueOnce(new ApiError({ status: 503, code: "UNAVAILABLE" }));
    fetchCount.mockResolvedValue(2);

    await vi.advanceTimersByTimeAsync(minute); // poll 1 fails
    expect(fetchCount).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot("store")).toBe(8);

    await vi.advanceTimersByTimeAsync(minute); // retry after a minute; poll 2 fails
    expect(fetchCount).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot("store")).toBe(8);

    await vi.advanceTimersByTimeAsync(2 * minute - 1); // the second failure doubles the wait
    expect(fetchCount).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCount).toHaveBeenCalledTimes(3);
    expect(store.getSnapshot("store")).toBe(2);

    await vi.advanceTimersByTimeAsync(minute); // success: back to the normal minute
    expect(fetchCount).toHaveBeenCalledTimes(4);
    stop();
  });
});

describe("live stream", () => {
  it("push takes a count from an event like a seed: it shows at once, clamps, and restarts the countdown", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    const listener = vi.fn();
    const stop = store.subscribe("store", listener);
    store.push("store", 4);
    expect(store.getSnapshot("store")).toBe(4);
    expect(listener).toHaveBeenCalledTimes(1);
    store.push("store", 4);
    expect(listener).toHaveBeenCalledTimes(1);
    store.push("store", 250);
    expect(store.getSnapshot("store")).toBe(UNREAD_CAP);

    await vi.advanceTimersByTimeAsync(minute - 1);
    expect(fetchCount).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    stop();
  });

  it("push lifts a stop: an event proves the session works", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    const stop = store.subscribe("store", () => {});
    fetchCount.mockRejectedValueOnce(new ApiError({ status: 401, code: "UNAUTHORIZED" }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10 * minute);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    store.push("store", 2);
    await vi.advanceTimersByTimeAsync(minute);
    expect(fetchCount).toHaveBeenCalledTimes(2);
    stop();
  });

  it("polls only every five minutes while the stream is open, and every minute again after it closes", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("store", 1);
    const stop = store.subscribe("store", () => {});
    store.setLive("store", true);

    await vi.advanceTimersByTimeAsync(LIVE_POLL_INTERVAL_MS - 1);
    expect(fetchCount).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(LIVE_POLL_INTERVAL_MS);
    expect(fetchCount).toHaveBeenCalledTimes(2);

    store.setLive("store", false);
    await vi.advanceTimersByTimeAsync(minute - 1);
    expect(fetchCount).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCount).toHaveBeenCalledTimes(3);
    stop();
  });

  it("asks at once when the stream closes after the short floor already passed", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    store.seed("store", 1);
    const stop = store.subscribe("store", () => {});
    store.setLive("store", true);
    await vi.advanceTimersByTimeAsync(3 * minute);
    expect(fetchCount).not.toHaveBeenCalled();
    store.setLive("store", false);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    stop();
  });

  it("an event while live pushes the next safety poll five minutes out", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    const stop = store.subscribe("store", () => {});
    store.setLive("store", true);
    store.push("store", 1);
    await vi.advanceTimersByTimeAsync(4 * minute);
    store.push("store", 2);
    await vi.advanceTimersByTimeAsync(4 * minute);
    expect(fetchCount).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(minute);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    stop();
  });

  it("an action's refresh still asks at once while live, and each family has its own flag", async () => {
    const { env, fetchCount } = fakeEnv();
    const store = createUnreadStore(env);
    const stopStore = store.subscribe("store", () => {});
    const stopClient = store.subscribe("client", () => {});
    store.seed("store", 1);
    store.seed("client", 1);
    store.setLive("store", true);
    await store.refresh("store");
    expect(fetchCount).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(minute);
    expect(fetchCount).toHaveBeenCalledTimes(2); // the client slot is not live: its minute passed
    expect(fetchCount).toHaveBeenLastCalledWith("client");
    stopStore();
    stopClient();
  });
});
