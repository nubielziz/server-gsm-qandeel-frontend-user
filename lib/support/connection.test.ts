import { describe, expect, it, vi } from "vitest";
import { createConnectionStore } from "./connection";

describe("createConnectionStore", () => {
  it("is idle until the stream was live once, says nothing for a stream that never opened", () => {
    const store = createConnectionStore();
    expect(store.get()).toBe("idle");
    store.update(false);
    expect(store.get()).toBe("idle");
  });

  it("goes live, then lost when it drops, and live again", () => {
    const store = createConnectionStore();
    store.update(true);
    expect(store.get()).toBe("live");
    store.update(false);
    expect(store.get()).toBe("lost");
    store.update(true);
    expect(store.get()).toBe("live");
  });

  it("calls listeners only when the answer changes, and not after they unsubscribe", () => {
    const store = createConnectionStore();
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    store.update(true);
    store.update(true);
    store.update(false);
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    store.update(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
