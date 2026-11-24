// Opens the stream a ticket page listens to (feature 28), on top of the shared stream client of feature 27
// (`createStream` in `lib/realtime/browser.ts`, which this feature does not edit).
// - The token page of a ticket (the page a guest or a retail account opens) opens its OWN stream,
//   `GET /store/v1/tickets/<token>/stream`, named after the ticket (`gsm-ticket-<number>`): its tabs share one connection
//   through the lock, and the server allows three per ticket.
// - The pages of a signed-in account (the thread and the list) use the stream of the account's family
//   (`GET /store/v1/me/stream` or `GET /client/stream`), which carries the ticket events of the signed-in account. The bell's
//   own client of that stream (`streamFor`) understands only notification events and drops the rest, so the ticket pages
//   keep a client of their own with its own lock (`gsm-ticket-stream-<family>`): one per browser and family, shared by every
//   ticket page, stopped when the last one leaves. The server's cap of three streams per session covers the bell's and this one.
// - The workspace's support badge (components/layout/workspace-badges-client.tsx) only WATCHES the shared client of its
//   family (`watchFamilyTicketStream`): it hears the ticket events while a ticket page holds the stream open, and never
//   opens, starts or stops one itself, so no workspace page opens a second stream for the badge.
// Import from Client Components only. Nothing connects before the caller starts the client.
import type { AccountFamily } from "@/lib/account/family";
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

const familyStreams = new Map<AccountFamily, { client: StreamClient<TicketEvents>; users: number }>();

/** The name of the lock and channel of a family's ticket stream. */
export function ticketFamilyLockName(family: AccountFamily): string {
  return `gsm-ticket-stream-${family}`;
}

export function openTicketStream(spec: TicketStreamSpec): TicketStreamHandle {
  if (spec.kind === "own") {
    const client = createStream<TicketEvents>({ url: spec.url, lockName: spec.lockName, ...SHARED });
    return { client, release: () => client.stop() };
  }
  return acquireFamilyTicketStream(spec.family);
}

/** The shared client of a family (made on first use; making it connects nothing). */
function sharedEntry(family: AccountFamily): { client: StreamClient<TicketEvents>; users: number } {
  let shared = familyStreams.get(family);
  if (!shared) {
    shared = {
      client: createStream<TicketEvents>({
        url: STREAM_API[family],
        lockName: ticketFamilyLockName(family),
        probePath: STREAM_PROBE_API[family],
        ...SHARED,
      }),
      users: 0,
    };
    familyStreams.set(family, shared);
  }
  return shared;
}

/**
 * The shared ticket stream's client of a family, to subscribe to WITHOUT being one of its users: the caller hears the
 * events whenever a ticket page has the stream open and must never call `start()` or `stop()` on it.
 */
export function watchFamilyTicketStream(family: AccountFamily): Pick<StreamClient<TicketEvents>, "subscribe"> {
  const { client } = sharedEntry(family);
  return { subscribe: client.subscribe };
}

/** The shared ticket stream of a family, counted: every `acquire` needs its `release`. */
export function acquireFamilyTicketStream(family: AccountFamily): TicketStreamHandle {
  const entry = sharedEntry(family);
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
