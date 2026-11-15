// The stream client (feature 27, plan §5): one server-sent-events connection per browser and stream, shared by its tabs.
// It is pure: every browser API arrives through `StreamEnv` (EventSource factory, Web Locks, BroadcastChannel, timers,
// visibility and page lifecycle, the refusal probe), so Vitest drives it with fakes and no browser. It knows nothing of
// notifications: `lib/realtime/browser.ts` builds the real environment and `createStream({ url, lockName })` is all a
// later feature needs to open its own stream (the ticket chat does) without editing this folder.
//
// The rules (the same small state machine as the console's, separate code):
// - Leader election. `locks.request(lockName)` makes one tab the leader: it opens the `EventSource` and repeats every
//   frame on the `BroadcastChannel`; the other tabs only listen. A leader that closes or freezes (`pagehide`, `freeze`)
//   lets the lock go, and the next tab opens a stream with the last cursor it heard. Without locks or a channel every
//   tab runs its own stream (the server's per-session cap refuses the fourth, which then polls).
// - URL: `<url>?locale=<page language>[&cursor=<last event id>]`. The client reconnects itself: an `EventSource` gives up
//   after any non-200 answer (Caddy's 502 during a restart), so on `error` it closes the source and opens a new one
//   after 5 s, doubling to 60 s, plus or minus 20 %; a `ready` resets the delay. A watchdog reconnects when nothing, not
//   even `hb`, arrived for 45 s. A visible tab that finds the stream stale or waiting tries at once (at most every 5 s).
// - Refusals. An `EventSource` does not show the status of a refusal, so an `error` before any `ready` asks the probe (the
//   surface's unread-count route) and decides from its answer: 401 or 403 stops the stream for this page load; 429 waits
//   its `Retry-After` (at least 60 s); a 200 means the stream itself was refused (a cap, the kill switch, a restart):
//   normal back-off, then 60 s from the third refusal in a row.
// - `bye`. The server ends a stream on purpose: after `max_age` or `reauth` the client reconnects within two seconds
//   with the cursor; after `shutdown` or `session_ended` it backs off (the next try is refused with 401 when the session is
//   gone, and the probe stops the client).
// - Events. A frame that names a key through `dedupeKey` is delivered once (a replay, a hand-over). `stream.refetch` is
//   made by the client for what a screen must reload: a `resync`, a `ready` with `resumed: true`, and a `ready` that is not
//   the first this stream ever delivered (a reconnect, a hand-over, a wake-up). Every tab gets it once per cause.
// Import it from Client Components only (it is pure, but its callers are not).

/** How a connection stands: `following` = another tab holds the stream; `waiting` = a back-off or a refusal wait. */
export type StreamState = "idle" | "following" | "connecting" | "open" | "waiting" | "stopped";

export type StreamStatus = {
  state: StreamState;
  /** True while events can arrive: this tab's stream is open, or another tab's stream was heard within the watchdog window. */
  live: boolean;
};

export type ByeReason = "max_age" | "shutdown" | "session_ended" | "reauth";
export type ReadyData = { v: number; heartbeatMs: number; resumed: boolean; serverTime: unknown };

/** The events every stream has (the shared hub's own), and the one the client makes. A stream's own map extends this. */
export type BaseEvents = {
  ready: ReadyData;
  /** Unix seconds. */
  hb: number;
  resync: { topics: string[] };
  bye: { reason: ByeReason };
  /** Made by the client, never sent: reload what is on screen (see the header). */
  "stream.refetch": { reason: "ready" | "resync" };
};

/** What a screen asks the probe: the answer of a cheap authenticated route of the same surface. */
export type ProbeOutcome =
  | { kind: "ok" }
  | { kind: "signed_out" }
  | { kind: "rate_limited"; retryAfterMs: number }
  | { kind: "failed" };

/** The part of `MessageEvent` the client reads. */
export type FrameEventLike = { data?: unknown; lastEventId?: string };

export interface EventSourceLike {
  addEventListener(type: string, listener: (event: FrameEventLike) => void): void;
  close(): void;
}

export interface LockManagerLike {
  request(name: string, options: { signal?: AbortSignal }, callback: () => Promise<void>): Promise<unknown>;
}

export interface ChannelLike {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  close(): void;
}

export type StreamTimers = {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** Milliseconds, like `Date.now()`. */
  now(): number;
  /** Like `Math.random()`. */
  random(): number;
};

export type StreamEnv = {
  /** Same-origin path of the stream, without a query. */
  url: string;
  /** The name of the lock and of the broadcast channel: one per browser and stream (`gsm-stream-customer`). */
  lockName: string;
  /** The page language for `?locale=`, or undefined to send none. */
  locale(): string | undefined;
  createEventSource(url: string): EventSourceLike;
  /** `navigator.locks`, or null where the browser has none (every tab then runs its own stream). */
  locks: LockManagerLike | null;
  /** A `BroadcastChannel`, or null where the browser has none. */
  createChannel(name: string): ChannelLike | null;
  timers: StreamTimers;
  isVisible(): boolean;
  /** Calls `listener` when the tab's visibility changes; returns the function that stops it. */
  onVisibilityChange(listener: () => void): () => void;
  /** The page is going away or freezing (`pagehide`, `freeze`): the stream and the lock must be let go. */
  onSuspend(listener: () => void): () => void;
  /** The page is back from the back/forward cache or from a freeze (`pageshow` with `persisted`, `resume`). */
  onResume(listener: () => void): () => void;
  /** Asked after an `error` before any `ready`; never rejects (a failure is `{ kind: "failed" }`). */
  probe(): Promise<ProbeOutcome>;
  /** Names to listen for besides the base ones and the subscribed ones (a tab that only follows needs them all). */
  events?: readonly string[];
  /** Parses the data of an event that is not a base event: return `undefined` to drop the frame. Default: JSON. */
  parseEvent?(event: string, raw: string): unknown;
  /** A key that names a frame for the duplicate check, or null for an event that is never a duplicate. */
  dedupeKey?(event: string, data: unknown): string | null;
};

export type StreamClient<M extends BaseEvents = BaseEvents> = {
  /** Calls `listener` for each frame of `event` (also from another tab's stream). Returns the function that stops it. */
  subscribe<K extends keyof M & string>(event: K, listener: (data: M[K]) => void): () => void;
  /** Calls `listener` whenever `status()` changes. */
  onStatus(listener: (status: StreamStatus) => void): () => void;
  status(): StreamStatus;
  /** Joins the stream (idempotent). Subscribe first: the names a leader listens for are the ones known when it connects. */
  start(): void;
  /** Leaves it: closes the source, lets the lock go, and forgets the cursor (idempotent; `start()` begins afresh). */
  stop(): void;
};

export const STREAM_BACKOFF_START_MS = 5_000;
export const STREAM_BACKOFF_MAX_MS = 60_000;
/** Back-off delays vary by plus or minus this share. */
export const STREAM_JITTER = 0.2;
export const STREAM_WATCHDOG_MS = 45_000;
/** The least wait after a 429 and from the third refusal in a row. */
export const STREAM_REFUSAL_WAIT_MS = 60_000;
export const STREAM_REFUSALS_BEFORE_LONG_WAIT = 3;
/** A visible tab does not retry sooner than this after the last attempt. */
export const STREAM_KICK_GAP_MS = 5_000;
/** After `bye` (`max_age`, `reauth`) clients come back within this spread, so a whole fleet does not return at one instant. */
export const STREAM_RECONNECT_SPREAD_MS = 2_000;
/** The server refuses a longer cursor (`z.string().max(64)`). */
export const STREAM_MAX_CURSOR_LENGTH = 64;
const SEEN_LIMIT = 500;

const BASE_NAMES: readonly string[] = ["ready", "hb", "resync", "bye"];
const REFETCH = "stream.refetch";
const BYE_REASONS: readonly string[] = ["max_age", "shutdown", "session_ended", "reauth"];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `JSON.parse` that returns `undefined` instead of throwing (JSON has no `undefined`, so it means "not JSON"). */
export function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** The data of a base event, checked and normalised, or `undefined` for a frame to drop. Other events: plain JSON. */
export function parseBaseFrame(name: string, raw: string): unknown {
  const value = parseJson(raw);
  if (value === undefined) return undefined;
  switch (name) {
    case "ready":
      if (!isRecord(value)) return undefined;
      return {
        v: typeof value.v === "number" ? value.v : 1,
        heartbeatMs: typeof value.heartbeatMs === "number" ? value.heartbeatMs : 15_000,
        resumed: value.resumed === true,
        serverTime: value.serverTime,
      } satisfies ReadyData;
    case "hb":
      return typeof value === "number" ? value : undefined;
    case "resync":
      if (!isRecord(value) || !Array.isArray(value.topics)) return undefined;
      return { topics: value.topics.filter((topic): topic is string => typeof topic === "string") };
    case "bye":
      if (!isRecord(value) || typeof value.reason !== "string" || !BYE_REASONS.includes(value.reason)) return undefined;
      return { reason: value.reason as ByeReason };
    default:
      return value;
  }
}

function isCursor(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= STREAM_MAX_CURSOR_LENGTH;
}

/** A consumer's failure never stops the stream or the other consumers. */
function safely(callback: () => void): void {
  try {
    callback();
  } catch {
    // Deliberately silent: the stream has no way to report it, and a broken listener must not break the rest.
  }
}

export function createStreamClient<M extends BaseEvents = BaseEvents>(env: StreamEnv): StreamClient<M> {
  const { timers } = env;
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const statusListeners = new Set<(status: StreamStatus) => void>();
  const offs: Array<() => void> = [];

  let started = false;
  let suspended = false;
  /** 401 or 403: no session, so this page load stops asking. */
  let halted = false;
  let state: StreamState = "idle";
  let live = false;
  let snapshot: StreamStatus = { state, live };

  let channel: ChannelLike | null = null;
  let lockAbort: AbortController | null = null;
  let releaseLock: (() => void) | null = null;
  let leader = false;

  let source: EventSourceLike | null = null;
  let attached = new Set<string>();
  let gotReady = false;
  let byeReason: ByeReason | null = null;
  let probing = false;
  /** Changes whenever the stream is left (stop, suspend, halt): an answer that arrives after it is stale. */
  let epoch = 0;

  let retryTimer: unknown = null;
  let watchdogTimer: unknown = null;
  let lastActivity = 0;
  let lastAttemptAt = 0;
  /** No early retry before this time (a 429 or a long refusal wait). */
  let holdUntil = 0;
  let attempt = 0;
  let refusals = 0;

  let cursor: string | null = null;
  /** How many `ready` frames this stream delivered; the second one means a reconnect. */
  let readyCount = 0;
  /** This tab heard another tab's stream before it became the leader. */
  let heardLeader = false;
  let tookOver = false;
  const seen = new Set<string>();

  // ── status ──────────────────────────────────────────────────────────────────────────────────────────────────────

  function publish(nextState: StreamState, nextLive: boolean) {
    if (state === nextState && live === nextLive) return;
    state = nextState;
    live = nextLive;
    snapshot = { state, live };
    for (const listener of [...statusListeners]) safely(() => listener(snapshot));
  }

  // ── timers ──────────────────────────────────────────────────────────────────────────────────────────────────────

  function clearRetry() {
    if (retryTimer !== null) timers.clearTimeout(retryTimer);
    retryTimer = null;
  }

  function clearWatchdog() {
    if (watchdogTimer !== null) timers.clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }

  /** Proof of life (a frame, a connect): the watchdog counts from here. */
  function touch() {
    lastActivity = timers.now();
    if (watchdogTimer === null) watchdogTimer = timers.setTimeout(checkWatchdog, STREAM_WATCHDOG_MS);
  }

  function checkWatchdog() {
    watchdogTimer = null;
    const idle = timers.now() - lastActivity;
    if (idle < STREAM_WATCHDOG_MS) {
      watchdogTimer = timers.setTimeout(checkWatchdog, STREAM_WATCHDOG_MS - idle);
      return;
    }
    if (leader && source) {
      closeSource();
      post({ type: "down" });
      publish("waiting", false);
      scheduleRetry(nextBackoff());
    } else if (!leader && live) {
      publish("following", false);
    }
  }

  function jitter(ms: number): number {
    return Math.round(ms * (1 + (timers.random() * 2 - 1) * STREAM_JITTER));
  }

  /** 5 s, 10 s, 20 s … up to 60 s, each varied by plus or minus 20 %. */
  function nextBackoff(): number {
    const base = Math.min(STREAM_BACKOFF_START_MS * 2 ** Math.min(attempt, 10), STREAM_BACKOFF_MAX_MS);
    attempt += 1;
    return jitter(base);
  }

  function scheduleRetry(delay: number, hold = false) {
    clearRetry();
    holdUntil = hold ? timers.now() + delay : 0;
    publish("waiting", false);
    retryTimer = timers.setTimeout(() => {
      retryTimer = null;
      holdUntil = 0;
      connect();
    }, delay);
  }

  // ── frames ──────────────────────────────────────────────────────────────────────────────────────────────────────

  function emit(name: string, data: unknown) {
    const set = listeners.get(name);
    if (!set) return;
    for (const listener of [...set]) safely(() => listener(data));
  }

  /** Parses a frame, drops a duplicate, hands it to the subscribers. Returns false when it was dropped. */
  function receive(name: string, raw: string): boolean {
    const data = BASE_NAMES.includes(name) ? parseBaseFrame(name, raw) : env.parseEvent ? env.parseEvent(name, raw) : parseJson(raw);
    if (data === undefined) return false;
    const key = env.dedupeKey?.(name, data) ?? null;
    if (key !== null) {
      const id = `${name}\u0000${key}`;
      if (seen.has(id)) return false;
      seen.add(id);
      if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value as string);
    }
    emit(name, data);
    if (name === "resync") emit(REFETCH, { reason: "resync" });
    return true;
  }

  function post(message: Record<string, unknown>) {
    if (!channel) return;
    try {
      channel.postMessage(message);
    } catch {
      // A closed channel: the other tabs recover through their own watchdog.
    }
  }

  /** A frame the leader got: deliver it here and repeat it to the other tabs. */
  function relay(name: string, raw: string) {
    if (receive(name, raw)) post({ type: "frame", event: name, data: raw, cursor });
  }

  function onReady(raw: string) {
    const data = parseBaseFrame("ready", raw) as ReadyData | undefined;
    gotReady = true;
    attempt = 0;
    refusals = 0;
    publish("open", true);
    const again = readyCount > 0 || tookOver || data?.resumed === true;
    readyCount += 1;
    relay("ready", raw);
    if (again) {
      emit(REFETCH, { reason: "ready" });
      post({ type: "refetch", reason: "ready" });
    }
  }

  function onFrame(from: EventSourceLike, name: string, event: FrameEventLike) {
    if (from !== source) return;
    touch();
    // `lastEventId` keeps the last id seen, so a frame without an id of its own still carries the cursor.
    if (isCursor(event.lastEventId)) cursor = event.lastEventId;
    const raw = typeof event.data === "string" ? event.data : "";
    if (name === "ready") {
      onReady(raw);
      return;
    }
    if (name === "bye") {
      const data = parseBaseFrame("bye", raw) as { reason: ByeReason } | undefined;
      if (data) byeReason = data.reason;
    }
    relay(name, raw);
  }

  function onError(from: EventSourceLike) {
    if (from !== source) return;
    const hadReady = gotReady;
    const reason = byeReason;
    closeSource();
    post({ type: "down" });
    publish("waiting", false);
    if (!leader || !started || suspended || halted) return;
    if (hadReady) {
      // A stream that was open ended. The server ends it on purpose at its maximum age and when it must re-check the
      // viewer: come back at once (spread out); every other end backs off from 5 s.
      const quick = reason === "max_age" || reason === "reauth";
      scheduleRetry(quick ? Math.round(timers.random() * STREAM_RECONNECT_SPREAD_MS) : nextBackoff());
    } else {
      void refused();
    }
  }

  /** An `error` before any `ready`: the browser does not say why, so ask a plain route of the same session. */
  async function refused() {
    const mine = epoch;
    probing = true;
    let outcome: ProbeOutcome;
    try {
      outcome = await env.probe();
    } catch {
      outcome = { kind: "failed" };
    }
    probing = false;
    if (mine !== epoch || !leader || source !== null) return;
    switch (outcome.kind) {
      case "signed_out":
        halt();
        return;
      case "rate_limited":
        scheduleRetry(Math.round(Math.max(outcome.retryAfterMs, STREAM_REFUSAL_WAIT_MS) * (1 + timers.random() * STREAM_JITTER)), true);
        return;
      case "ok":
        refusals += 1;
        if (refusals >= STREAM_REFUSALS_BEFORE_LONG_WAIT) scheduleRetry(jitter(STREAM_REFUSAL_WAIT_MS), true);
        else scheduleRetry(nextBackoff());
        return;
      default:
        scheduleRetry(nextBackoff());
    }
  }

  // ── the connection ──────────────────────────────────────────────────────────────────────────────────────────────

  function closeSource() {
    clearWatchdog();
    const current = source;
    // Cleared first: a late event of the closed source finds `source !== from` and is ignored.
    source = null;
    attached = new Set();
    if (!current) return;
    try {
      current.close();
    } catch {
      // Already closed.
    }
  }

  function frameNames(): string[] {
    const names = new Set<string>([...BASE_NAMES, ...(env.events ?? []), ...listeners.keys()]);
    names.delete(REFETCH);
    return [...names];
  }

  function attach(target: EventSourceLike, name: string) {
    if (attached.has(name)) return;
    attached.add(name);
    target.addEventListener(name, (event) => onFrame(target, name, event));
  }

  function connect() {
    if (!leader || !started || suspended || halted) return;
    clearRetry();
    closeSource();
    lastAttemptAt = timers.now();
    gotReady = false;
    byeReason = null;
    const params = new URLSearchParams();
    const locale = env.locale();
    if (locale) params.set("locale", locale);
    if (cursor) params.set("cursor", cursor);
    const query = params.toString();
    let next: EventSourceLike;
    try {
      next = env.createEventSource(query ? `${env.url}?${query}` : env.url);
    } catch {
      scheduleRetry(nextBackoff());
      return;
    }
    source = next;
    next.addEventListener("error", () => onError(next));
    for (const name of frameNames()) attach(next, name);
    publish("connecting", false);
    touch();
  }

  function becomeLeader() {
    leader = true;
    tookOver = heardLeader;
    connect();
  }

  /** The stream failed for good: this page load has no session. Let the lock go so another tab can find that out too. */
  function halt() {
    halted = true;
    leaveAll();
    publish("stopped", false);
  }

  /** Everything this tab holds: the source, the timers, the lock, the channel. */
  function leaveAll() {
    epoch += 1;
    if (leader) post({ type: "down" });
    closeSource();
    clearRetry();
    clearWatchdog();
    lockAbort?.abort();
    lockAbort = null;
    const release = releaseLock;
    releaseLock = null;
    release?.();
    channel?.close();
    channel = null;
    leader = false;
    probing = false;
    holdUntil = 0;
  }

  // ── the tabs ────────────────────────────────────────────────────────────────────────────────────────────────────

  function onMessage(event: { data: unknown }) {
    // The leader has its own stream, and a replay from its own cursor covers what a late message of the old leader carried.
    if (leader || !started || suspended || halted) return;
    const message = event.data;
    if (!isRecord(message)) return;
    if (message.type === "frame" && typeof message.event === "string" && typeof message.data === "string") {
      heardLeader = true;
      if (isCursor(message.cursor)) cursor = message.cursor;
      touch();
      publish("following", true);
      receive(message.event, message.data);
    } else if (message.type === "refetch") {
      heardLeader = true;
      emit(REFETCH, { reason: message.reason === "resync" ? "resync" : "ready" });
    } else if (message.type === "down") {
      publish("following", false);
    }
  }

  function requestLock(locks: LockManagerLike) {
    const abort = new AbortController();
    lockAbort = abort;
    locks
      .request(
        env.lockName,
        { signal: abort.signal },
        () =>
          new Promise<void>((resolve) => {
            if (lockAbort !== abort || !started || suspended || halted) {
              resolve();
              return;
            }
            releaseLock = resolve;
            becomeLeader();
          }),
      )
      .then(
        () => undefined,
        () => {
          if (abort.signal.aborted || lockAbort !== abort) return;
          // The browser refused locks (a sandboxed frame): this tab runs its own stream and shares nothing.
          channel?.close();
          channel = null;
          lockAbort = null;
          becomeLeader();
        },
      );
  }

  function join() {
    if (!started || suspended || halted) return;
    heardLeader = false;
    tookOver = false;
    channel = null;
    if (env.locks) {
      try {
        channel = env.createChannel(env.lockName);
      } catch {
        channel = null;
      }
    }
    if (!env.locks || !channel) {
      channel = null;
      becomeLeader();
      return;
    }
    channel.addEventListener("message", onMessage);
    publish("following", false);
    requestLock(env.locks);
  }

  function suspend() {
    if (!started || suspended) return;
    suspended = true;
    leaveAll();
    publish("idle", false);
  }

  function resume() {
    if (!started || !suspended) return;
    suspended = false;
    attempt = 0;
    refusals = 0;
    join();
  }

  /** A tab the visitor just looked at: do not wait out a back-off or a silent stream. */
  function onVisible() {
    if (!env.isVisible() || !started || suspended || halted) return;
    const now = timers.now();
    if (!leader) {
      if (live && now - lastActivity >= STREAM_WATCHDOG_MS) publish("following", false);
      return;
    }
    if (source && now - lastActivity >= STREAM_WATCHDOG_MS) {
      connect();
    } else if (!source && retryTimer !== null && !probing && now >= holdUntil && now - lastAttemptAt >= STREAM_KICK_GAP_MS) {
      connect();
    }
  }

  function resetSession() {
    cursor = null;
    readyCount = 0;
    attempt = 0;
    refusals = 0;
    heardLeader = false;
    tookOver = false;
    seen.clear();
  }

  return {
    subscribe(event, listener) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      const entry = listener as (data: unknown) => void;
      set.add(entry);
      if (source && event !== REFETCH) attach(source, event);
      return () => {
        set.delete(entry);
      };
    },
    onStatus(listener) {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
    status: () => snapshot,
    start() {
      if (started) return;
      started = true;
      suspended = false;
      halted = false;
      resetSession();
      offs.push(env.onVisibilityChange(onVisible), env.onSuspend(suspend), env.onResume(resume));
      join();
    },
    stop() {
      if (!started) return;
      started = false;
      suspended = false;
      halted = false;
      leaveAll();
      for (const off of offs.splice(0)) off();
      resetSession();
      publish("idle", false);
    },
  };
}
