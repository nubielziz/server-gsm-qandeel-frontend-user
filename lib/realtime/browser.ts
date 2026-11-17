// The browser's side of the stream client: builds the real `StreamEnv` (EventSource, Web Locks, BroadcastChannel, page
// lifecycle, the refusal probe through the API client) around the pure client of `stream-client.ts`.
// - `streamFor(surface)`: the notification stream of the customer area or the merchant portal, one shared instance.
//   Only a bell opens it (`components/notifications/notification-stream.tsx`): public pages never do.
// - `createStream({ url, lockName })`: any other stream (the ticket chat of feature 28). Same rules, own lock and channel.
// Import only from Client Components. Nothing here touches the browser until `start()` is called.
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import type { NotificationSurface } from "@/lib/notifications/link";
import {
  dedupeKeyOf,
  NOTIFICATION_EVENT_NAMES,
  parseFrame,
  STREAM_API,
  STREAM_PROBE_API,
  streamLockName,
  type NotificationEvents,
} from "./events";
import {
  createStreamClient,
  type BaseEvents,
  type LockManagerLike,
  type ProbeOutcome,
  type StreamClient,
  type StreamEnv,
} from "./stream-client";

export type StreamOptions = {
  /** Same-origin path of the stream (no query). */
  url: string;
  /** The name of the lock and of the broadcast channel: one per browser and stream, for example `gsm-stream-ticket-42`. */
  lockName: string;
  /**
   * A cheap authenticated `GET` of the same surface, asked after a refused stream: 401 or 403 stops the stream, 429 slows
   * it. Without one a refusal only backs off.
   */
  probePath?: string;
  /** Events to listen for besides `ready`, `hb`, `resync`, `bye` and the ones subscribed before `start()`. */
  events?: readonly string[];
  /** Parses an event that is not a base event (return `undefined` to drop it). Default: JSON. */
  parseEvent?: (event: string, raw: string) => unknown;
  /** A key naming a frame for the duplicate check, or null for an event that never repeats. */
  dedupeKey?: (event: string, data: unknown) => string | null;
};

/** The answer of a plain route, in the three words the client acts on. Never rejects. */
async function probeRoute(path: string): Promise<ProbeOutcome> {
  try {
    await api.get(path);
    return { kind: "ok" };
  } catch (error) {
    if (isApiError(error)) {
      if (error.status === 401 || error.status === 403) return { kind: "signed_out" };
      if (error.status === 429) return { kind: "rate_limited", retryAfterMs: (error.retryAfter ?? 0) * 1000 };
    }
    return { kind: "failed" };
  }
}

/** `navigator.locks` as the client uses it, or null where the browser has none. */
function browserLocks(): LockManagerLike | null {
  if (typeof navigator === "undefined" || !navigator.locks) return null;
  const locks = navigator.locks;
  return { request: (name, lockOptions, callback) => locks.request(name, lockOptions, callback) };
}

function browserEnv(options: StreamOptions): StreamEnv {
  const { probePath } = options;
  return {
    url: options.url,
    lockName: options.lockName,
    createEventSource: (url) => new EventSource(url),
    locks: browserLocks(),
    createChannel: (name) => (typeof BroadcastChannel === "function" ? new BroadcastChannel(name) : null),
    timers: {
      setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
      clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
      now: () => Date.now(),
      random: () => Math.random(),
    },
    isVisible: () => typeof document === "undefined" || document.visibilityState === "visible",
    onVisibilityChange(listener) {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
    onSuspend(listener) {
      // `pagehide` fires on a navigation and when the page goes into the back/forward cache; `freeze` when the browser
      // freezes a hidden tab. A frozen leader would keep the lock and starve the other tabs.
      window.addEventListener("pagehide", listener);
      document.addEventListener("freeze", listener);
      return () => {
        window.removeEventListener("pagehide", listener);
        document.removeEventListener("freeze", listener);
      };
    },
    onResume(listener) {
      const onShow = (event: PageTransitionEvent) => {
        if (event.persisted) listener();
      };
      window.addEventListener("pageshow", onShow);
      document.addEventListener("resume", listener);
      return () => {
        window.removeEventListener("pageshow", onShow);
        document.removeEventListener("resume", listener);
      };
    },
    probe: probePath ? () => probeRoute(probePath) : async () => ({ kind: "ok" }),
    events: options.events,
    parseEvent: options.parseEvent,
    dedupeKey: options.dedupeKey,
  };
}

/**
 * A stream client for any same-origin SSE route that follows the shared hub's rules (`ready`, `hb`, `resync`, `bye`).
 * `M` is the stream's own event map (extend `BaseEvents`). Nothing connects before `start()`.
 */
export function createStream<M extends BaseEvents = BaseEvents>(options: StreamOptions): StreamClient<M> {
  return createStreamClient<M>(browserEnv(options));
}

const notificationStreams: Partial<Record<NotificationSurface, StreamClient<NotificationEvents>>> = {};

/** The notification stream of a surface: one instance per page load, shared by the bell and the notifications list. */
export function streamFor(surface: NotificationSurface): StreamClient<NotificationEvents> {
  return (notificationStreams[surface] ??= createStream<NotificationEvents>({
    url: STREAM_API[surface],
    lockName: streamLockName(surface),
    probePath: STREAM_PROBE_API[surface],
    events: NOTIFICATION_EVENT_NAMES,
    parseEvent: parseFrame,
    dedupeKey: dedupeKeyOf,
  }));
}
