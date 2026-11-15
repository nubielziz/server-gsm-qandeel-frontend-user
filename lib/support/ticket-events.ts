// The ticket chat's live events, REQUESTER VIEW (feature 28; backend plan `docs/briefs/28-support-live-chat.md` §3.4).
// Hand-written on purpose: the OpenAPI describes the stream routes but not the frames. Safe to import anywhere.
//
// A requester (a customer on the token page, a merchant in the portal) gets four events. None carries a token, a staff
// name, an assignee or a note: the server renders a separate, smaller view for the requester.
// - `ticket.message.created`: a public message (id `t<message id>` on the wire). The only event that can repeat.
// - `ticket.updated`: status, dates, rating, `hasUnread`.
// - `ticket.read`: one side saw messages up to an id (`by: "you"` is another tab or device of the same person).
// - `ticket.typing`: support is typing a REPLY (a note never reaches a requester).
// `ticketId` is the id for a merchant and `null` for a customer (customers address tickets by token, which never goes into
// an event): a customer's page matches by `number`.
import type { TicketMessage } from "@/lib/api/types";
import { isRecord, parseBaseFrame, parseJson, type BaseEvents } from "@/lib/realtime/stream-client";

/** The events of the ticket chat besides the base ones (`ready`, `hb`, `resync`, `bye`). */
export const TICKET_EVENT_NAMES = ["ticket.message.created", "ticket.updated", "ticket.read", "ticket.typing"] as const;

export type TicketStatus = "new" | "open" | "pending" | "resolved";

/** What names a ticket in an event: the id for a merchant (`ticketId`), the number for everyone. */
export type TicketRef = { ticketId: number | null; number: string };

export type TicketMessageCreated = TicketRef & {
  message: TicketMessage;
  /** False for a message a reconnect replayed: it is not news (no "New message" button, no typing reset). */
  live: boolean;
};

export type TicketUpdated = TicketRef & {
  status: TicketStatus;
  updatedAt: string;
  resolvedAt: string | null;
  canRate: boolean;
  csatScore: number | null;
  hasUnread: boolean;
};

export type TicketRead = TicketRef & {
  /** `you`: the requester (another tab or device). `support`: the team saw the requester's messages. */
  by: "you" | "support";
  upToMessageId: number;
  at: string;
};

export type TicketTyping = TicketRef;

export type TicketEvents = BaseEvents & {
  "ticket.message.created": TicketMessageCreated;
  "ticket.updated": TicketUpdated;
  "ticket.read": TicketRead;
  "ticket.typing": TicketTyping;
};

const STATUSES: readonly unknown[] = ["new", "open", "pending", "resolved"];

function isId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function refOf(value: Record<string, unknown>): TicketRef | null {
  if (!isText(value.number) || value.number === "") return null;
  if (value.ticketId !== null && value.ticketId !== undefined && !isId(value.ticketId)) return null;
  return { ticketId: isId(value.ticketId) ? value.ticketId : null, number: value.number };
}

/** A file on a message, or null for a value this page does not understand. */
function attachmentOf(value: unknown): { id: number; filename: string; mime: string; size: number } | null {
  if (!isRecord(value) || !isId(value.id) || !isText(value.filename)) return null;
  return {
    id: value.id,
    filename: value.filename,
    mime: isText(value.mime) ? value.mime : "",
    size: typeof value.size === "number" && Number.isFinite(value.size) ? value.size : 0,
  };
}

/** The public message of an event (requester view), or null. `attachments` defaults to none (an older backend). */
export function messageOf(value: unknown): TicketMessage | null {
  if (!isRecord(value) || !isId(value.id) || !isText(value.body) || !isText(value.createdAt)) return null;
  if (value.from !== "you" && value.from !== "support") return null;
  const attachments = Array.isArray(value.attachments)
    ? value.attachments.map(attachmentOf).filter((a): a is NonNullable<ReturnType<typeof attachmentOf>> => a !== null)
    : [];
  return { id: value.id, from: value.from, body: value.body, createdAt: value.createdAt, attachments };
}

/**
 * The data of a frame of a ticket stream, checked, or `undefined` for a frame to drop (not JSON, a shape the page does
 * not understand, or an event this version does not know). Base events go through `parseBaseFrame`.
 */
export function parseTicketFrame(event: string, raw: string): unknown {
  switch (event) {
    case "ticket.message.created": {
      const value = parseJson(raw);
      if (!isRecord(value)) return undefined;
      const ref = refOf(value);
      const message = messageOf(value.message);
      if (!ref || !message) return undefined;
      return { ...ref, message, live: value.live === true } satisfies TicketMessageCreated;
    }
    case "ticket.updated": {
      const value = parseJson(raw);
      if (!isRecord(value)) return undefined;
      const ref = refOf(value);
      if (!ref || !STATUSES.includes(value.status) || !isText(value.updatedAt) || !isNullableText(value.resolvedAt ?? null)) return undefined;
      return {
        ...ref,
        status: value.status as TicketStatus,
        updatedAt: value.updatedAt,
        resolvedAt: (value.resolvedAt as string | null | undefined) ?? null,
        canRate: value.canRate === true,
        csatScore: typeof value.csatScore === "number" ? value.csatScore : null,
        hasUnread: value.hasUnread === true,
      } satisfies TicketUpdated;
    }
    case "ticket.read": {
      const value = parseJson(raw);
      if (!isRecord(value)) return undefined;
      const ref = refOf(value);
      if (!ref || (value.by !== "you" && value.by !== "support") || !isId(value.upToMessageId)) return undefined;
      return { ...ref, by: value.by, upToMessageId: value.upToMessageId, at: isText(value.at) ? value.at : "" } satisfies TicketRead;
    }
    case "ticket.typing": {
      const value = parseJson(raw);
      return isRecord(value) ? (refOf(value) ?? undefined) : undefined;
    }
    case "ready":
    case "hb":
    case "resync":
    case "bye":
      return parseBaseFrame(event, raw);
    default:
      return undefined;
  }
}

/**
 * The duplicate check of the stream: a message is handled once, whichever tab or replay brings it again. Only
 * `ticket.message.created` can repeat; the other events are state, so repeating one is harmless.
 */
export function ticketDedupeKey(event: string, data: unknown): string | null {
  if (event !== "ticket.message.created" || !isRecord(data) || !isRecord(data.message)) return null;
  return `message:${String(data.message.id)}`;
}

/** True when an event is about this ticket: by id for a merchant's, by number for a customer's. */
export function isAbout(ref: TicketRef, ticket: { id?: number; number: string }): boolean {
  if (ticket.id !== undefined && ref.ticketId !== null) return ref.ticketId === ticket.id;
  return ref.number === ticket.number;
}
