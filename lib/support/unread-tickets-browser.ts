// The browser's support-badge store (lib/support/unread-tickets.ts): the ticket list through the same-origin API client and
// the ticket events of the surface's shared ticket stream, only watched (lib/support/ticket-stream.ts). Import only from
// Client Components.
import { api } from "@/lib/api/browser";
import { listQuery } from "@/lib/api/query";
import { watchSurfaceTicketStream } from "./ticket-stream";
import { createUnreadTickets, TICKET_LIST_API, UNREAD_SCAN, unreadNumbers, type UnreadTicketsEnv } from "./unread-tickets";

type TicketRow = { number: string; hasUnread: boolean };

const browserEnv: UnreadTicketsEnv = {
  async fetchUnread(surface) {
    const { data } = await api.list<TicketRow>(TICKET_LIST_API[surface], { query: listQuery({ start: 0, end: UNREAD_SCAN }) });
    return unreadNumbers(data);
  },
  watch(surface, handlers) {
    const client = watchSurfaceTicketStream(surface);
    const stops = [
      client.subscribe("ticket.updated", (data) => handlers.updated(data.number, data.hasUnread)),
      client.subscribe("ticket.read", (data) => {
        if (data.by === "you") handlers.readByVisitor(data.number);
      }),
      client.subscribe("stream.refetch", () => handlers.refetch()),
    ];
    return () => {
      for (const stop of stops) stop();
    };
  },
  now: () => Date.now(),
};

/** The store the support badges of this page share. */
export const unreadTickets = createUnreadTickets(browserEnv);
