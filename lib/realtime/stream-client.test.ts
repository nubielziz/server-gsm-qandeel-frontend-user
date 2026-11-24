import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createStreamClient,
  parseBaseFrame,
  STREAM_BACKOFF_MAX_MS,
  STREAM_WATCHDOG_MS,
  type BaseEvents,
  type ChannelLike,
  type EventSourceLike,
  type FrameEventLike,
  type LockManagerLike,
  type ProbeOutcome,
  type StreamClient,
  type StreamEnv,
  type StreamStatus,
} from "./stream-client";

// ── fakes: the browser APIs the client is given ──────────────────────────────────────────────────────────────────────

class FakeSource implements EventSourceLike {
  closed = false;
  private handlers = new Map<string, Array<(event: FrameEventLike) => void>>();
  constructor(readonly url: string) {}
  addEventListener(type: string, listener: (event: FrameEventLike) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
  }
  names() {
    return [...this.handlers.keys()];
  }
  /** The server sent a frame (what an open EventSource delivers). */
  frame(name: string, data: unknown, lastEventId = "") {
    if (this.closed) return;
    for (const handler of this.handlers.get(name) ?? []) handler({ data: typeof data === "string" ? data : JSON.stringify(data), lastEventId });
  }
  /** The connection broke or was refused: the browser fires `error`. */
  fail() {
    if (this.closed) return;
    for (const handler of this.handlers.get("error") ?? []) handler({});
  }
}

const abortError = () => new DOMException("aborted", "AbortError");

/** Exclusive named locks with a queue, like `navigator.locks`. */
class FakeLocks implements LockManagerLike {
  private held = new Set<string>();
  private queues = new Map<string, Array<{ callback: () => Promise<void>; resolve: (value: unknown) => void; reject: (error: unknown) => void }>>();
  request(name: string, options: { signal?: AbortSignal }, callback: () => Promise<void>) {
    return new Promise<unknown>((resolve, reject) => {
      if (options.signal?.aborted) return reject(abortError());
      const entry = { callback, resolve, reject };
      const queue = this.queues.get(name) ?? [];
      this.queues.set(name, queue);
      queue.push(entry);
      options.signal?.addEventListener("abort", () => {
        const index = queue.indexOf(entry);
        if (index >= 0) {
          queue.splice(index, 1);
          reject(abortError());
        }
      });
      this.drain(name);
    });
  }
  private drain(name: string) {
    if (this.held.has(name)) return;
    const next = this.queues.get(name)?.shift();
    if (!next) return;
    this.held.add(name);
    void Promise.resolve()
      .then(() => next.callback())
      .then(next.resolve, next.reject)
      .finally(() => {
        this.held.delete(name);
        this.drain(name);
      });
  }
}

class FakeChannel implements ChannelLike {
  closed = false;
  listeners: Array<(event: { data: unknown }) => void> = [];
  constructor(private bus: FakeBus, readonly name: string) {}
  postMessage(message: unknown) {
    for (const other of this.bus.channels.get(this.name) ?? []) {
      if (other === this || other.closed) continue;
      const copy = structuredClone(message);
      queueMicrotask(() => {
        if (!other.closed) for (const listener of other.listeners) listener({ data: copy });
      });
    }
  }
  addEventListener(_type: "message", listener: (event: { data: unknown }) => void) {
    this.listeners.push(listener);
  }
  close() {
    this.closed = true;
  }
}

class FakeBus {
  channels = new Map<string, Set<FakeChannel>>();
  create(name: string): ChannelLike {
    const channel = new FakeChannel(this, name);
    const set = this.channels.get(name) ?? new Set();
    set.add(channel);
    this.channels.set(name, set);
    return channel;
  }
}

type Shared = { locks: LockManagerLike | null; bus: FakeBus | null };
const sharedBrowser = (): Shared => ({ locks: new FakeLocks(), bus: new FakeBus() });
const lone: Shared = { locks: null, bus: null };

const flush = () => vi.advanceTimersByTimeAsync(0);

/** One tab: its own client, EventSources, page lifecycle and probe, over the locks and channel it shares with others. */
function makeTab(shared: Shared, options: { withDedupe?: boolean; events?: string[] } = {}) {
  const sources: FakeSource[] = [];
  const probe = vi.fn<() => Promise<ProbeOutcome>>(async () => ({ kind: "ok" }));
  const visibility = new Set<() => void>();
  const suspendListeners = new Set<() => void>();
  const resumeListeners = new Set<() => void>();
  let visible = true;
  const random = { value: 0.5 };
  const createEventSource = vi.fn((url: string) => {
    const source = new FakeSource(url);
    sources.push(source);
    return source;
  });
  const env: StreamEnv = {
    url: "/store/v1/me/stream",
    lockName: "gsm-stream-store",
    createEventSource,
    locks: shared.locks,
    createChannel: (name) => shared.bus?.create(name) ?? null,
    timers: {
      setTimeout: (callback, ms) => setTimeout(callback, ms),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      now: () => Date.now(),
      random: () => random.value,
    },
    isVisible: () => visible,
    onVisibilityChange(listener) {
      visibility.add(listener);
      return () => visibility.delete(listener);
    },
    onSuspend(listener) {
      suspendListeners.add(listener);
      return () => suspendListeners.delete(listener);
    },
    onResume(listener) {
      resumeListeners.add(listener);
      return () => resumeListeners.delete(listener);
    },
    probe,
    // The real stream names its events up front: a tab that only follows needs them all, and so does a later leader.
    events: options.events ?? ["notification.created", "unread.changed"],
    dedupeKey: options.withDedupe
      ? (event, data) => (event === "notification.created" ? `item:${String((data as { id: number }).id)}` : null)
      : undefined,
  };
  type Events = BaseEvents & { "notification.created": { id: number }; "unread.changed": { unread: number } };
  const client: StreamClient<Events> = createStreamClient<Events>(env);
  const statuses: StreamStatus[] = [];
  client.onStatus((status) => statuses.push(status));
  return {
    client,
    sources,
    probe,
    statuses,
    random,
    createEventSource,
    /** The newest EventSource. */
    get source() {
      return sources[sources.length - 1]!;
    },
    setVisible(next: boolean) {
      visible = next;
      for (const listener of [...visibility]) listener();
    },
    suspend: () => suspendListeners.forEach((listener) => listener()),
    resume: () => resumeListeners.forEach((listener) => listener()),
    listenerCounts: () => visibility.size + suspendListeners.size + resumeListeners.size,
  };
}

type Tab = ReturnType<typeof makeTab>;

const ready = (resumed = false) => ({ v: 1, heartbeatMs: 15_000, resumed, serverTime: 1 });

/** Starts a lone tab and answers `ready`. */
async function openLone(options: Parameters<typeof makeTab>[1] = {}): Promise<Tab> {
  const tab = makeTab(lone, options);
  tab.client.start();
  tab.source.frame("ready", ready());
  return tab;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("one tab", () => {
  it("opens the stream with no query (no language: the API answers in English), is live after ready, and listens for base and subscribed events", () => {
    const tab = makeTab(lone, { events: ["unread.changed"] });
    const created = vi.fn();
    tab.client.subscribe("notification.created", created);
    tab.client.start();
    expect(tab.createEventSource).toHaveBeenCalledWith("/store/v1/me/stream");
    expect(tab.client.status()).toEqual({ state: "connecting", live: false });
    expect(tab.source.names()).toEqual(expect.arrayContaining(["error", "ready", "hb", "resync", "bye", "unread.changed", "notification.created"]));
    expect(tab.source.names()).not.toContain("stream.refetch");

    tab.source.frame("ready", ready());
    expect(tab.client.status()).toEqual({ state: "open", live: true });
    tab.source.frame("notification.created", { id: 7 }, "i7");
    expect(created).toHaveBeenCalledWith({ id: 7 });
  });

  it("starts only once", () => {
    const tab = makeTab(lone);
    tab.client.start();
    tab.client.start();
    expect(tab.sources).toHaveLength(1);
    expect(tab.createEventSource).toHaveBeenCalledWith("/store/v1/me/stream");
  });

  it("listens for an event subscribed after the connection opened", () => {
    const tab = makeTab(lone);
    tab.client.start();
    const read = vi.fn();
    tab.client.subscribe("unread.changed", read);
    tab.source.frame("unread.changed", { unread: 4 });
    expect(read).toHaveBeenCalledWith({ unread: 4 });
  });

  it("drops frames it cannot parse and keeps going; a failing listener does not stop the others", () => {
    const tab = makeTab(lone);
    const good = vi.fn();
    tab.client.subscribe("unread.changed", () => {
      throw new Error("boom");
    });
    tab.client.subscribe("unread.changed", good);
    tab.client.subscribe("hb", good);
    tab.client.start();
    tab.source.frame("ready", ready());
    tab.source.frame("hb", "not a number");
    tab.source.frame("unread.changed", "{not json");
    tab.source.frame("unread.changed", { unread: 2 });
    expect(good).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledWith({ unread: 2 });
    expect(tab.client.status().live).toBe(true);
  });

  it("ignores a frame of a source it already closed", async () => {
    const tab = await openLone();
    const read = vi.fn();
    tab.client.subscribe("unread.changed", read);
    const old = tab.source;
    old.fail();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(tab.sources).toHaveLength(2);
    old.frame("unread.changed", { unread: 9 });
    expect(read).not.toHaveBeenCalled();
  });
});

describe("cursor and bye", () => {
  it("reconnects with the last event id, also from a frame that has no id of its own", async () => {
    const tab = await openLone();
    tab.source.frame("notification.created", { id: 12 }, "i12");
    tab.source.frame("hb", 1_700_000_000, "i12");
    tab.source.fail();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(tab.source.url).toBe("/store/v1/me/stream?cursor=i12");
  });

  it("does not send a cursor the server would refuse (more than 64 characters)", async () => {
    const tab = await openLone();
    tab.source.frame("hb", 1, "i".repeat(65));
    tab.source.fail();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(tab.source.url).toBe("/store/v1/me/stream");
  });

  it("comes back within two seconds after a bye for max_age or reauth", async () => {
    for (const reason of ["max_age", "reauth"]) {
      const tab = await openLone();
      tab.source.frame("bye", { reason });
      tab.source.fail();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(tab.sources, reason).toHaveLength(2);
      tab.client.stop();
    }
  });

  it("backs off after a bye for shutdown", async () => {
    const tab = await openLone();
    tab.source.frame("bye", { reason: "shutdown" });
    tab.source.fail();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(tab.sources).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(tab.sources).toHaveLength(2);
  });

  it("stops after a bye for session_ended once the next try is refused with 401", async () => {
    const tab = await openLone();
    tab.probe.mockResolvedValue({ kind: "signed_out" });
    tab.source.frame("bye", { reason: "session_ended" });
    tab.source.fail();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(tab.sources).toHaveLength(2);
    tab.source.fail(); // 401 problem+json: the EventSource errors before any ready
    await flush();
    expect(tab.probe).toHaveBeenCalledTimes(1);
    expect(tab.client.status()).toEqual({ state: "stopped", live: false });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(tab.sources).toHaveLength(2);
  });
});

describe("back-off", () => {
  it("waits 5 s after a stream that was open, then 10, 20 and 60 s for refusals in a row, and ready resets it", async () => {
    const tab = await openLone();
    const waits: number[] = [];
    async function nextConnectAfterFailure(): Promise<void> {
      const before = tab.sources.length;
      const start = Date.now();
      tab.source.fail();
      await flush();
      while (tab.sources.length === before) await vi.advanceTimersByTimeAsync(1_000);
      waits.push(Date.now() - start);
    }
    await nextConnectAfterFailure(); // was open: 5 s
    await nextConnectAfterFailure(); // refusal 1: 10 s
    await nextConnectAfterFailure(); // refusal 2: 20 s
    await nextConnectAfterFailure(); // refusal 3: 60 s
    await nextConnectAfterFailure(); // refusal 4: still 60 s
    expect(waits).toEqual([5_000, 10_000, 20_000, 60_000, 60_000]);
    expect(tab.probe).toHaveBeenCalledTimes(4);

    tab.source.frame("ready", ready());
    waits.length = 0;
    await nextConnectAfterFailure();
    expect(waits).toEqual([5_000]);
  });

  it("doubles up to the cap when the probe cannot tell (a restart), without counting refusals", async () => {
    const tab = await openLone();
    tab.probe.mockResolvedValue({ kind: "failed" });
    const waits: number[] = [];
    for (let i = 0; i < 7; i++) {
      const before = tab.sources.length;
      const start = Date.now();
      tab.source.fail();
      await flush();
      while (tab.sources.length === before) await vi.advanceTimersByTimeAsync(1_000);
      waits.push(Date.now() - start);
    }
    expect(waits).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000]);
  });

  it("varies every wait by plus or minus 20 %", async () => {
    const results: number[] = [];
    for (const random of [0, 1]) {
      const tab = await openLone();
      tab.random.value = random;
      const start = Date.now();
      tab.source.fail();
      await flush();
      while (tab.sources.length === 1) await vi.advanceTimersByTimeAsync(100);
      results.push(Date.now() - start);
      tab.client.stop();
    }
    expect(results).toEqual([4_000, 6_000]);
  });

  it("opens again at once when the EventSource cannot even be created, after a back-off", async () => {
    const tab = makeTab(lone);
    tab.createEventSource.mockImplementationOnce(() => {
      throw new Error("no EventSource here");
    });
    tab.client.start();
    expect(tab.sources).toHaveLength(0);
    expect(tab.client.status().state).toBe("waiting");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(tab.sources).toHaveLength(1);
  });
});

describe("watchdog", () => {
  it("reconnects when nothing, not even hb, arrived for 45 s; any frame resets the count", async () => {
    const tab = await openLone();
    await vi.advanceTimersByTimeAsync(30_000);
    tab.source.frame("hb", 1);
    await vi.advanceTimersByTimeAsync(STREAM_WATCHDOG_MS - 1);
    expect(tab.sources).toHaveLength(1);
    expect(tab.client.status().live).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(tab.sources[0]!.closed).toBe(true);
    expect(tab.client.status()).toEqual({ state: "waiting", live: false });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(tab.sources).toHaveLength(2);
  });

  it("also guards a connection that never says ready", async () => {
    const tab = makeTab(lone);
    tab.client.start();
    await vi.advanceTimersByTimeAsync(STREAM_WATCHDOG_MS);
    expect(tab.sources[0]!.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(tab.sources).toHaveLength(2);
    expect(tab.probe).not.toHaveBeenCalled(); // a silent stream is not a refusal
  });

  it("a visible tab that finds a silent stream (a woken laptop) reconnects at once", async () => {
    const tab = await openLone();
    vi.setSystemTime(Date.now() + 5 * 60_000); // the clock moved, no timer ran
    tab.setVisible(true);
    expect(tab.sources).toHaveLength(2);
    expect(tab.sources[0]!.closed).toBe(true);
  });
});

describe("refusals", () => {
  async function refused(tab: Tab, outcome: ProbeOutcome) {
    tab.probe.mockResolvedValue(outcome);
    tab.source.fail();
    await flush();
  }

  it("asks the probe only for an error before any ready", async () => {
    const tab = await openLone();
    tab.source.fail();
    await flush();
    expect(tab.probe).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    tab.source.fail(); // never said ready
    await flush();
    expect(tab.probe).toHaveBeenCalledTimes(1);
  });

  it("401 or 403 stops the stream for this page load; stop then start begins afresh", async () => {
    const tab = makeTab(lone);
    tab.client.start();
    await refused(tab, { kind: "signed_out" });
    expect(tab.client.status()).toEqual({ state: "stopped", live: false });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(tab.sources).toHaveLength(1);
    tab.setVisible(true);
    tab.client.start(); // already started: nothing
    expect(tab.sources).toHaveLength(1);
    tab.client.stop();
    expect(tab.client.status().state).toBe("idle");
    tab.client.start();
    expect(tab.sources).toHaveLength(2);
  });

  it("429 waits its Retry-After, at least 60 s", async () => {
    const tab = makeTab(lone);
    tab.random.value = 0; // no extra spread, so the wait is exact
    tab.client.start();
    await refused(tab, { kind: "rate_limited", retryAfterMs: 10_000 });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(tab.sources).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(tab.sources).toHaveLength(2);
    await refused(tab, { kind: "rate_limited", retryAfterMs: 120_000 });
    await vi.advanceTimersByTimeAsync(119_999);
    expect(tab.sources).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(tab.sources).toHaveLength(3);
  });

  it("does not let a visible tab cut a 429 wait short, but does cut an ordinary back-off", async () => {
    const tab = makeTab(lone);
    tab.client.start();
    await refused(tab, { kind: "rate_limited", retryAfterMs: 0 });
    await vi.advanceTimersByTimeAsync(10_000);
    tab.setVisible(true);
    expect(tab.sources).toHaveLength(1);

    const other = makeTab(lone);
    other.client.start();
    await refused(other, { kind: "failed" }); // 5 s
    await vi.advanceTimersByTimeAsync(10);
    other.setVisible(true); // under 5 s since the last attempt: not yet
    expect(other.sources).toHaveLength(1);
    await refused(other, { kind: "failed" }); // not a new attempt: source is closed
    await vi.advanceTimersByTimeAsync(5_000);
    expect(other.sources).toHaveLength(2);
    await refused(other, { kind: "failed" }); // 10 s
    await vi.advanceTimersByTimeAsync(6_000);
    other.setVisible(true);
    expect(other.sources).toHaveLength(3);
  });

  it("a stop during the probe cancels what it would have decided", async () => {
    const tab = makeTab(lone);
    let answer: (outcome: ProbeOutcome) => void = () => undefined;
    tab.probe.mockReturnValue(new Promise<ProbeOutcome>((resolve) => (answer = resolve)));
    tab.client.start();
    tab.source.fail();
    tab.client.stop();
    answer({ kind: "ok" });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(tab.sources).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("events", () => {
  it("delivers an item once, however often it comes (replay, hand-over)", async () => {
    const tab = await openLone({ withDedupe: true });
    const created = vi.fn();
    tab.client.subscribe("notification.created", created);
    tab.source.frame("notification.created", { id: 5 }, "i5");
    tab.source.frame("notification.created", { id: 5 }, "i5");
    tab.source.frame("notification.created", { id: 6 }, "i6");
    expect(created.mock.calls.map(([item]) => (item as { id: number }).id)).toEqual([5, 6]);
  });

  it("never treats a count as a duplicate", async () => {
    const tab = await openLone({ withDedupe: true });
    const changed = vi.fn();
    tab.client.subscribe("unread.changed", changed);
    tab.source.frame("unread.changed", { unread: 3 }, "i5");
    tab.source.frame("unread.changed", { unread: 3 }, "i5");
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("asks screens to refetch after a resumed ready, a resync, and every ready but the first", async () => {
    const tab = makeTab(lone);
    const refetch = vi.fn();
    tab.client.subscribe("stream.refetch", refetch);
    tab.client.start();
    tab.source.frame("ready", ready());
    expect(refetch).not.toHaveBeenCalled();

    tab.source.frame("resync", { topics: ["inbox"] });
    expect(refetch).toHaveBeenLastCalledWith({ reason: "resync" });
    expect(refetch).toHaveBeenCalledTimes(1);

    tab.source.fail();
    await vi.advanceTimersByTimeAsync(5_000);
    tab.source.frame("ready", ready()); // a reconnect
    expect(refetch).toHaveBeenCalledTimes(2);
    expect(refetch).toHaveBeenLastCalledWith({ reason: "ready" });

    const resumed = makeTab(lone);
    const resumedRefetch = vi.fn();
    resumed.client.subscribe("stream.refetch", resumedRefetch);
    resumed.client.start();
    resumed.source.frame("ready", ready(true));
    expect(resumedRefetch).toHaveBeenCalledTimes(1);
  });

  it("stop() forgets the cursor and the history: the next ready is a first one again", async () => {
    const tab = makeTab(lone, { withDedupe: true });
    const refetch = vi.fn();
    const created = vi.fn();
    tab.client.subscribe("stream.refetch", refetch);
    tab.client.subscribe("notification.created", created);
    tab.client.start();
    tab.source.frame("ready", ready());
    tab.source.frame("notification.created", { id: 1 }, "i1");
    tab.client.stop();
    expect(tab.source.closed).toBe(true);
    expect(tab.listenerCounts()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    tab.client.start();
    expect(tab.source.url).toBe("/store/v1/me/stream");
    tab.source.frame("ready", ready());
    tab.source.frame("notification.created", { id: 1 }, "i1");
    expect(refetch).not.toHaveBeenCalled();
    expect(created).toHaveBeenCalledTimes(2);
  });
});

describe("page lifecycle", () => {
  it("lets the stream go when the page freezes and opens it again, with the cursor, when it resumes", async () => {
    const tab = makeTab(lone);
    const refetch = vi.fn();
    tab.client.subscribe("stream.refetch", refetch);
    tab.client.start();
    tab.source.frame("ready", ready());
    tab.source.frame("hb", 1, "i3");
    tab.suspend();
    expect(tab.sources[0]!.closed).toBe(true);
    expect(tab.client.status()).toEqual({ state: "idle", live: false });
    expect(vi.getTimerCount()).toBe(0);
    tab.suspend(); // twice: nothing more

    tab.resume();
    expect(tab.sources).toHaveLength(2);
    expect(tab.source.url).toBe("/store/v1/me/stream?cursor=i3");
    tab.source.frame("ready", ready(true));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("a stopped tab ignores pageshow and resume", () => {
    const tab = makeTab(lone);
    tab.resume();
    expect(tab.sources).toHaveLength(0);
  });
});

describe("several tabs", () => {
  async function twoTabs() {
    const shared = sharedBrowser();
    const a = makeTab(shared);
    const b = makeTab(shared);
    a.client.start();
    await flush();
    b.client.start();
    await flush();
    return { shared, a, b };
  }

  it("only the first tab opens the stream; the other follows and gets every frame", async () => {
    const { a, b } = await twoTabs();
    expect(a.sources).toHaveLength(1);
    expect(b.sources).toHaveLength(0);
    expect(b.client.status()).toEqual({ state: "following", live: false });

    const seenByB = vi.fn();
    const seenByA = vi.fn();
    a.client.subscribe("unread.changed", seenByA);
    b.client.subscribe("unread.changed", seenByB);
    a.source.frame("ready", ready());
    a.source.frame("unread.changed", { unread: 3 });
    await flush();
    expect(seenByA).toHaveBeenCalledWith({ unread: 3 });
    expect(seenByB).toHaveBeenCalledWith({ unread: 3 });
    expect(b.client.status()).toEqual({ state: "following", live: true });
    expect(a.client.status()).toEqual({ state: "open", live: true });
  });

  it("tells the followers when the stream is down, and that the screens must refetch when it comes back", async () => {
    const { a, b } = await twoTabs();
    const refetchB = vi.fn();
    b.client.subscribe("stream.refetch", refetchB);
    a.source.frame("ready", ready());
    await flush();
    a.source.fail();
    await flush();
    expect(b.client.status().live).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    a.source.frame("ready", ready());
    await flush();
    expect(b.client.status().live).toBe(true);
    expect(refetchB).toHaveBeenCalledTimes(1);
  });

  it("a follower that hears nothing for 45 s is not live any more", async () => {
    const { shared, a, b } = await twoTabs();
    a.source.frame("ready", ready());
    await flush();
    expect(b.client.status().live).toBe(true);
    // The leader keeps hearing its server but its repeats no longer reach the follower (a stuck tab).
    const [leaderChannel] = [...shared.bus!.channels.get("gsm-stream-store")!];
    const mute = vi.spyOn(leaderChannel!, "postMessage").mockImplementation(() => undefined);
    await vi.advanceTimersByTimeAsync(30_000);
    a.source.frame("hb", 1);
    await vi.advanceTimersByTimeAsync(STREAM_WATCHDOG_MS - 30_000);
    expect(b.client.status().live).toBe(false);
    mute.mockRestore();
    a.source.frame("hb", 2);
    await flush();
    expect(b.client.status().live).toBe(true);
  });

  it("hands over with the cursor when the leader freezes, then everyone refetches once and no item repeats", async () => {
    const { shared, a, b } = await twoTabs();
    const c = makeTab(shared, { withDedupe: true });
    const bWithDedupe = b; // b has no dedupe: it only checks the cursor and the refetch
    c.client.start();
    await flush();
    const itemsOfC = vi.fn();
    const refetchB = vi.fn();
    const refetchC = vi.fn();
    c.client.subscribe("notification.created", itemsOfC);
    bWithDedupe.client.subscribe("stream.refetch", refetchB);
    c.client.subscribe("stream.refetch", refetchC);

    a.source.frame("ready", ready());
    a.source.frame("notification.created", { id: 5 }, "i5");
    await flush();
    expect(itemsOfC).toHaveBeenCalledTimes(1);

    a.suspend(); // the leader freezes: the lock passes on
    await flush();
    expect(a.source.closed).toBe(true);
    expect(b.sources).toHaveLength(1);
    expect(c.sources).toHaveLength(0);
    expect(b.source.url).toBe("/store/v1/me/stream?cursor=i5");

    b.source.frame("ready", ready(true));
    b.source.frame("notification.created", { id: 5 }, "i5"); // a replay of what C already has
    b.source.frame("notification.created", { id: 6 }, "i6");
    await flush();
    expect(itemsOfC.mock.calls.map(([item]) => (item as { id: number }).id)).toEqual([5, 6]);
    expect(refetchB).toHaveBeenCalledTimes(1);
    expect(refetchC).toHaveBeenCalledTimes(1);

    // The frozen tab comes back as a follower: the lock is taken.
    a.resume();
    await flush();
    expect(a.sources).toHaveLength(1);
    expect(a.client.status().state).toBe("following");
  });

  it("hands over when the leader stops (a bell that unmounts)", async () => {
    const { a, b } = await twoTabs();
    a.source.frame("ready", ready());
    await flush();
    a.client.stop();
    await flush();
    expect(b.sources).toHaveLength(1);
    expect(b.client.status().state).toBe("connecting");
    // It heard the old leader, so its first ready already means "you may have missed something".
    const refetch = vi.fn();
    b.client.subscribe("stream.refetch", refetch);
    b.source.frame("ready", ready());
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("a leader that is signed out lets the lock go, and the next tab finds out for itself", async () => {
    const { a, b } = await twoTabs();
    a.probe.mockResolvedValue({ kind: "signed_out" });
    b.probe.mockResolvedValue({ kind: "signed_out" });
    a.source.fail();
    await flush();
    expect(a.client.status().state).toBe("stopped");
    expect(b.sources).toHaveLength(1);
    b.source.fail();
    await flush();
    expect(b.client.status().state).toBe("stopped");
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(a.sources).toHaveLength(1);
    expect(b.sources).toHaveLength(1);
  });

  it("a tab that stops while it waits for the lock never becomes the leader", async () => {
    const { a, b } = await twoTabs();
    b.client.stop();
    a.client.stop();
    await flush();
    expect(b.sources).toHaveLength(0);
  });

  it("without a broadcast channel every tab runs its own stream", async () => {
    const shared: Shared = { locks: new FakeLocks(), bus: null };
    const a = makeTab(shared);
    const b = makeTab(shared);
    a.client.start();
    b.client.start();
    await flush();
    expect(a.sources).toHaveLength(1);
    expect(b.sources).toHaveLength(1);
  });

  it("without Web Locks every tab runs its own stream", () => {
    const shared: Shared = { locks: null, bus: new FakeBus() };
    const a = makeTab(shared);
    const b = makeTab(shared);
    a.client.start();
    b.client.start();
    expect(a.sources).toHaveLength(1);
    expect(b.sources).toHaveLength(1);
  });

  it("a browser that refuses the lock request runs its own stream", async () => {
    const refusing: LockManagerLike = { request: () => Promise.reject(new DOMException("denied", "SecurityError")) };
    const tab = makeTab({ locks: refusing, bus: new FakeBus() });
    tab.client.start();
    await flush();
    expect(tab.sources).toHaveLength(1);
  });
});

describe("parseBaseFrame", () => {
  it("normalises the base events and rejects what does not fit", () => {
    expect(parseBaseFrame("ready", '{"v":1,"heartbeatMs":15000,"resumed":true,"serverTime":5}')).toEqual({
      v: 1,
      heartbeatMs: 15_000,
      resumed: true,
      serverTime: 5,
    });
    expect(parseBaseFrame("ready", "{}")).toMatchObject({ resumed: false, heartbeatMs: 15_000 });
    expect(parseBaseFrame("ready", "[]")).toBeUndefined();
    expect(parseBaseFrame("hb", "1731664000")).toBe(1_731_664_000);
    expect(parseBaseFrame("hb", '"x"')).toBeUndefined();
    expect(parseBaseFrame("resync", '{"topics":["inbox",3]}')).toEqual({ topics: ["inbox"] });
    expect(parseBaseFrame("resync", "{}")).toBeUndefined();
    expect(parseBaseFrame("bye", '{"reason":"max_age"}')).toEqual({ reason: "max_age" });
    expect(parseBaseFrame("bye", '{"reason":"because"}')).toBeUndefined();
    expect(parseBaseFrame("other", '{"a":1}')).toEqual({ a: 1 });
    expect(parseBaseFrame("other", "{")).toBeUndefined();
    expect(STREAM_BACKOFF_MAX_MS).toBe(60_000);
  });
});
