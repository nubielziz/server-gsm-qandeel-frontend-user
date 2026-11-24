// What the bottom of a ticket conversation shows (owner, 2026-11-15): the reply box while the ticket is open, a calm
// "This ticket is closed" notice once staff resolve it (`status: "resolved"`). Pure functions, so the component only wires
// them; safe to import anywhere.
// Backend rules: a requester's message or upload on a resolved ticket answers `409 TICKET_RESOLVED`, read marks still
// work, and staff can reopen the ticket (the requester cannot).
// - Closed while the visitor was writing (a `ticket.updated` event or a read): the draft is discarded, and the notice says
//   so politely.
// - A send (or an upload) refused as closed (the visitor sent before the event arrived): the notice shows and keeps the
//   visitor's text in it, so it can be copied. That text is not "discarded".
// - Reopened by staff: the box comes back; the text of a refused send goes back into it.
import type { TicketStatus } from "./ticket-events";

/** The API's answer to a requester writing on a resolved ticket. */
export const TICKET_RESOLVED = "TICKET_RESOLVED";

/** The requester can no longer write on the ticket. */
export function isClosed(status: TicketStatus): boolean {
  return status === "resolved";
}

export type ReplyArea = {
  /** What the area last showed: the notice (true) or the box. */
  closed: boolean;
  /** The notice appeared while the page was open (not with the page): it may take the focus the box had. */
  live: boolean;
  /** A draft was thrown away when the ticket closed. */
  discarded: boolean;
  /** The text of a send the API refused as closed, shown in the notice; null when there is none. */
  unsent: string | null;
  /** The text the reply box starts with when it comes back after a reopen. */
  restore: string;
};

/** The area as the page first shows it. */
export function initialReplyArea(status: TicketStatus): ReplyArea {
  return { closed: isClosed(status), live: false, discarded: false, unsent: null, restore: "" };
}

/**
 * The area once the ticket's status is `status`; the same object when nothing changes. `drafting` is whether the reply box
 * holds unsent text or files right now.
 */
export function replyAreaFor(area: ReplyArea, status: TicketStatus, drafting: boolean): ReplyArea {
  const closed = isClosed(status);
  if (closed === area.closed) return area;
  if (closed) return { closed: true, live: true, discarded: drafting && area.unsent === null, unsent: area.unsent, restore: "" };
  return { closed: false, live: false, discarded: false, unsent: null, restore: area.unsent ?? "" };
}

/**
 * A send (or an upload) the API refused as closed: keep the box's text for the notice (the status turns `resolved` with
 * it). An empty text (a message of files only) is kept as `""`: nothing to copy, and nothing was "discarded" either.
 */
export function refusedAsClosed(area: ReplyArea, text: string): ReplyArea {
  return { ...area, unsent: text };
}

/** The refused text worth showing in the notice, or null. */
export function unsentText(area: ReplyArea): string | null {
  return area.unsent !== null && area.unsent.trim() !== "" ? area.unsent : null;
}
