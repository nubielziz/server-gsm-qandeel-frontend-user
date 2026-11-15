// Opens the stream a ticket page listens to (feature 28), on top of the shared stream client of feature 27
// (`createStream` in `lib/realtime/browser.ts`, which this feature does not edit).
// - The customer's token page opens its OWN stream, `GET /store/v1/tickets/<token>/stream`, named after the ticket
//   (`gsm-ticket-<number>`): its tabs share one connection through the lock, and the server allows three per ticket.
// - The merchant's pages (the thread and the list) use the merchant's stream (`GET /client/stream`), which carries the
//   ticket events of the signed-in merchant. The bell's own client of that stream (`streamFor`) understands only
//   notification events and drops the rest, so the ticket pages keep a client of their own with its own lock
//   (`gsm-ticket-stream-<surface>`): one per browser and surface, shared by every ticket page, stopped when the last one
//   leaves. The server's cap of three streams per session covers the bell's and this one.
// - The workspace's support badge (components/layout/workspace-badges-client.tsx) only WATCHES the shared client of its
//   surface (`watchSurfaceTicketStream`): it hears the ticket events while a ticket page holds the stream open, and never
//   opens, starts or stops one itself, so no workspace page opens a second stream for the badge.
// Import from Client Components only. Nothing connects before the caller starts the client.
import type { NotificationSurface } from "@/lib/notifications/link";
import { createStream } from "@/lib/realtime/browser";
import { STREAM_API, STREAM_PROBE_API } from "@/lib/realtime/events";
import type { StreamClient } from "@/lib/realtime/stream-client";
import type { TicketStreamSpec } from "./ticket-api";
import { parseTicketFrame, ticketDedupeKey, TICKET_EVENT_NAMES, type TicketEvents } from "./ticket-events";

export type TicketStreamHandle = {
  /** Subscribe, then `start()` it. */
  client: StreamClient<TicketEvents>;
  /** Leaves the stream: closes an own stream, or drops this user of a shared one (the last user closes it). */
  release(): void;
};

const SHARED = { events: TICKET_EVENT_NAMES, parseEvent: parseTicketFrame, dedupeKey: ticketDedupeKey } as const;

const surfaceStreams = new Map<NotificationSurface, { client: StreamClient<TicketEvents>; users: number }>();

/** The name of the lock and channel of a surface's ticket stream. */
export function ticketSurfaceLockName(surface: NotificationSurface): string {
  return `gsm-ticket-stream-${surface}`;
}

export function openTicketStream(spec: TicketStreamSpec): TicketStreamHandle {
  if (spec.kind === "own") {
    const client = createStream<TicketEvents>({ url: spec.url, lockName: spec.lockName, ...SHARED });
    return { client, release: () => client.stop() };
  }
  return acquireSurfaceTicketStream(spec.surface);
}

/** The shared client of a surface (made on first use; making it connects nothing). */
function sharedEntry(surface: NotificationSurface): { client: StreamClient<TicketEvents>; users: number } {
  let shared = surfaceStreams.get(surface);
  if (!shared) {
    shared = {
      client: createStream<TicketEvents>({
        url: STREAM_API[surface],
        lockName: ticketSurfaceLockName(surface),
        probePath: STREAM_PROBE_API[surface],
        ...SHARED,
      }),
      users: 0,
    };
    surfaceStreams.set(surface, shared);
  }
  return shared;
}

/**
 * The shared ticket stream's client of a surface, to subscribe to WITHOUT being one of its users: the caller hears the
 * events whenever a ticket page has the stream open and must never call `start()` or `stop()` on it.
 */
export function watchSurfaceTicketStream(surface: NotificationSurface): Pick<StreamClient<TicketEvents>, "subscribe"> {
  const { client } = sharedEntry(surface);
  return { subscribe: client.subscribe };
}

/** The shared ticket stream of a surface, counted: every `acquire` needs its `release`. */
export function acquireSurfaceTicketStream(surface: NotificationSurface): TicketStreamHandle {
  const entry = sharedEntry(surface);
  entry.users += 1;
  let released = false;
  return {
    client: entry.client,
    release() {
      if (released) return;
      released = true;
      entry.users -= 1;
      if (entry.users === 0) entry.client.stop();
    },
  };
}
