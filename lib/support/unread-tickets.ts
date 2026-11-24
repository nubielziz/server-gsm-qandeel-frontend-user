// The support badge of the workspace navigation (owner, 2026-11-15): a dot on Support while a ticket has a
// reply from support that the visitor has not seen. One small external store per family (store, client), read
// with `useSyncExternalStore`, the same shape as the bell's unread store (lib/notifications/unread-store.ts):
// - the server passes the first list (the numbers of the tickets with `hasUnread` among the 50 most recently active), so
//   the dot is right in the first paint; a later server list never overwrites a newer read of the store, it makes the
//   store ask when the two differ (`reconcile`);
// - live: the ticket events of the family's shared ticket stream (lib/support/ticket-stream.ts) keep it current while a
//   ticket page has that stream open: `ticket.updated` says a ticket's `hasUnread`, the visitor's own `ticket.read`
//   (`by: "you"`, this or another device) clears it, `stream.refetch` asks again. The badge only watches that stream: it
//   never opens one, because the bell's stream (lib/realtime) does not hand ticket events to the shell and a second
//   always-open stream on every workspace page would double the connections;
// - otherwise it asks again on a client navigation (`refresh`), at most once every `NAVIGATION_FLOOR_MS`;
// - 401 and 403 stop it for good (the session is gone); other failures keep the last known value.
// Pure (safe anywhere, the server reads the first list with the same constants); `createUnreadTickets` takes its
// dependencies so the tests need no browser. The browser's instance is `unreadTickets` in unread-tickets-browser.ts.
import { isApiError } from "@/lib/api/errors";
import type { AccountFamily } from "@/lib/account/family";
import { FAMILY_ROUTES } from "@/lib/account/routes";

/** The least time between two reads caused by navigations. */
export const NAVIGATION_FLOOR_MS = 15_000;
/** How many of the most recently active tickets are looked at (the list routes' largest page). */
export const UNREAD_SCAN = 50;

/** The list route of each family (`GET`, newest activity first by default), from the one route table. */
export const TICKET_LIST_API: Record<AccountFamily, string> = {
  store: FAMILY_ROUTES.store.tickets,
  client: FAMILY_ROUTES.client.tickets,
};

/** The numbers ("T-1042") of the tickets in `rows` that have a reply the visitor has not seen. */
export function unreadNumbers(rows: readonly { number: string; hasUnread: boolean }[]): string[] {
  return rows.filter((row) => row.hasUnread).map((row) => row.number);
}

export type TicketWatch = {
  /** A ticket's state changed: its unread flag. */
  updated(number: string, hasUnread: boolean): void;
  /** The visitor saw a ticket's messages (this tab, another tab or device). */
  readByVisitor(number: string): void;
  /** The stream missed events (a reconnect, a resync): read the list again. */
  refetch(): void;
};

export type UnreadTicketsEnv = {
  /** The numbers of the tickets with an unseen reply; rejects with an `ApiError`. */
  fetchUnread(family: AccountFamily): Promise<string[]>;
  /** Listens to the family's ticket events without opening a stream; returns the function that stops listening. */
  watch(family: AccountFamily, handlers: TicketWatch): () => void;
  now(): number;
};

export type UnreadTickets = {
  /** For `useSyncExternalStore`. The first listener starts watching the ticket events, the last one stops. */
  subscribe(family: AccountFamily, listener: () => void): () => void;
  /** True while a ticket has an unseen reply; `null` before the store knows. */
  getSnapshot(family: AccountFamily): boolean | null;
  /** A list a server render brought: taken as is when the store knows nothing yet, else a reason to ask when it differs. */
  reconcile(family: AccountFamily, numbers: readonly string[]): void;
  /** A client navigation: asks the API, at most once every `NAVIGATION_FLOOR_MS` and never twice at once. */
  refresh(family: AccountFamily): Promise<void>;
};

type Slot = {
  /** The numbers of the unread tickets, or null before the first value. */
  unread: Set<string> | null;
  snapshot: boolean | null;
  listeners: Set<() => void>;
  stopWatch: (() => void) | undefined;
  /** When the value was last read or seeded: the navigation floor counts from here. */
  lastAt: number | null;
  inFlight: boolean;
  /** A forced read was asked while one ran: ask once more when it ends. */
  again: boolean;
  stopped: boolean;
};

const sameSet = (a: ReadonlySet<string>, b: readonly string[]) => a.size === new Set(b).size && b.every((n) => a.has(n));

export function createUnreadTickets(env: UnreadTicketsEnv): UnreadTickets {
  const slots: Record<AccountFamily, Slot> = { store: newSlot(), client: newSlot() };

  function newSlot(): Slot {
    return { unread: null, snapshot: null, listeners: new Set(), stopWatch: undefined, lastAt: null, inFlight: false, again: false, stopped: false };
  }

  function publish(slot: Slot) {
    const next = slot.unread === null ? null : slot.unread.size > 0;
    if (next === slot.snapshot) return;
    slot.snapshot = next;
    for (const listener of [...slot.listeners]) listener();
  }

  function seed(slot: Slot, numbers: readonly string[]) {
    slot.unread = new Set(numbers);
    slot.lastAt = env.now();
    publish(slot);
  }

  async function run(family: AccountFamily, force: boolean): Promise<void> {
    const slot = slots[family];
    if (slot.stopped) return;
    if (!force && slot.lastAt !== null && env.now() - slot.lastAt < NAVIGATION_FLOOR_MS) return;
    if (slot.inFlight) {
      if (force) slot.again = true;
      return;
    }
    slot.inFlight = true;
    try {
      seed(slot, await env.fetchUnread(family));
    } catch (error) {
      // The last known value stays on screen; the floor still counts from this try.
      slot.lastAt = env.now();
      if (isApiError(error) && (error.status === 401 || error.status === 403)) slot.stopped = true;
    } finally {
      slot.inFlight = false;
    }
    if (slot.again && !slot.stopped) {
      slot.again = false;
      await run(family, true);
    }
    slot.again = false;
  }

  function startWatch(family: AccountFamily) {
    const slot = slots[family];
    slot.stopWatch = env.watch(family, {
      updated(number, hasUnread) {
        if (slot.unread === null) return; // nothing known yet: the first read decides
        if (hasUnread) slot.unread.add(number);
        else slot.unread.delete(number);
        publish(slot);
      },
      readByVisitor(number) {
        if (slot.unread === null) return;
        slot.unread.delete(number);
        publish(slot);
      },
      refetch() {
        void run(family, true);
      },
    });
  }

  return {
    subscribe(family, listener) {
      const slot = slots[family];
      slot.listeners.add(listener);
      if (slot.listeners.size === 1) startWatch(family);
      return () => {
        slot.listeners.delete(listener);
        if (slot.listeners.size > 0) return;
        slot.stopWatch?.();
        slot.stopWatch = undefined;
      };
    },
    getSnapshot(family) {
      return slots[family].snapshot;
    },
    reconcile(family, numbers) {
      const slot = slots[family];
      if (slot.unread === null || slot.stopped) {
        slot.stopped = false;
        seed(slot, numbers);
      } else if (!sameSet(slot.unread, numbers)) {
        void run(family, true);
      }
    },
    refresh(family) {
      return run(family, false);
    },
  };
}
