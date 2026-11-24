// The state of an open ticket conversation (feature 28) as pure functions, so the component that shows it
// (`components/support/ticket-conversation.tsx`) only wires them to the stream and the DOM.
// Rules (backend plan §2 and §4.2):
// - The ticket the server read is the first state. A message the visitor sends is appended from the answer of the `POST`
//   (`sent`); the event with the same id is then ignored. Messages are kept in the order of their id, whatever the order
//   they arrive in, and each id appears once.
// - `ticket.updated` and a refetch replace status and dates, but never with older data (`updatedAt` decides).
// - A resolved ticket is closed to the visitor (owner, 2026-11-15): a message or file answers `409 TICKET_RESOLVED`
//   (`closed`), and only staff reopen it (lib/support/reply-area.ts decides what the reply area shows).
// - Each side has one "seen" mark: the highest message id of the OTHER side it has seen. Marks only move forward.
// - The visitor marks support's messages read only when the tab is visible and the end of the conversation is on screen.
// Safe to import anywhere.
import type { Attachment, TicketMessage } from "@/lib/api/types";
import type { TicketStatus, TicketUpdated } from "./ticket-events";

/** Without a stream the ticket is read again this often (while the tab is visible). */
export const FALLBACK_REFETCH_MS = 30_000;

/** A message with its attachments always present (an older backend sends none). */
export type ConversationMessage = Omit<TicketMessage, "attachments"> & { attachments: Attachment[] };

/** What both ticket answers (`Ticket`, `ClientTicket`) have in common for the conversation. */
export type TicketSource = {
  status: TicketStatus;
  updatedAt: string;
  resolvedAt: string | null;
  messages: TicketMessage[];
  seenByYou?: number | null;
  seenBySupport?: number | null;
};

export type ConversationState = {
  /** Oldest first, ordered by id, each id once. */
  messages: ConversationMessage[];
  status: TicketStatus;
  updatedAt: string;
  resolvedAt: string | null;
  /** The highest support message id the visitor has seen (0: none). */
  seenByYou: number;
  /** The highest visitor message id support has seen (0: none). */
  seenBySupport: number;
};

export type ConversationAction =
  /** A message from an event or a refetch: appended in id order, ignored when its id is known. */
  | { type: "message"; message: TicketMessage }
  /** The visitor's own message, from the answer of the `POST`: like `message`, and a reply moves a pending ticket to open. */
  | { type: "sent"; message: TicketMessage }
  /** The API refused the visitor's message or file as `409 TICKET_RESOLVED`: the ticket is closed (the event, or a read, brings its dates). */
  | { type: "closed" }
  | { type: "updated"; data: Pick<TicketUpdated, "status" | "updatedAt" | "resolvedAt"> }
  | { type: "read"; by: "you" | "support"; upToMessageId: number }
  | { type: "snapshot"; source: TicketSource };

function normalise(message: TicketMessage): ConversationMessage {
  return { ...message, attachments: message.attachments ?? [] };
}

/** The first state: what the server read. */
export function initialState(source: TicketSource): ConversationState {
  const messages: ConversationMessage[] = [];
  for (const message of source.messages) messages.push(normalise(message));
  messages.sort((a, b) => a.id - b.id);
  return {
    messages: dedupeById(messages),
    status: source.status,
    updatedAt: source.updatedAt,
    resolvedAt: source.resolvedAt,
    seenByYou: source.seenByYou ?? 0,
    seenBySupport: source.seenBySupport ?? 0,
  };
}

function dedupeById(sorted: ConversationMessage[]): ConversationMessage[] {
  return sorted.filter((message, index) => index === 0 || message.id !== sorted[index - 1].id);
}

/** The messages with `message` added in id order; the same array when its id is already there. */
export function insertMessage(messages: ConversationMessage[], message: TicketMessage): ConversationMessage[] {
  if (messages.some((existing) => existing.id === message.id)) return messages;
  const next = normalise(message);
  let at = messages.length;
  while (at > 0 && messages[at - 1].id > next.id) at -= 1;
  return [...messages.slice(0, at), next, ...messages.slice(at)];
}

/** The highest id among the messages `from` one side; 0 when there is none. */
export function lastIdFrom(messages: readonly { id: number; from: "you" | "support" }[], from: "you" | "support"): number {
  let last = 0;
  for (const message of messages) if (message.from === from && message.id > last) last = message.id;
  return last;
}

/** An ISO time is not older than another (same format with milliseconds: text order is time order). */
function notOlder(next: string, current: string): boolean {
  return next >= current;
}

export function conversationReducer(state: ConversationState, action: ConversationAction): ConversationState {
  switch (action.type) {
    case "message": {
      const messages = insertMessage(state.messages, action.message);
      return messages === state.messages ? state : { ...state, messages };
    }
    case "sent": {
      const messages = insertMessage(state.messages, action.message);
      // The visitor writing on a pending ticket moves it back to open (backend rule). A resolved ticket takes no messages
      // from the visitor any more (`409 TICKET_RESOLVED`, the `closed` action), so a reply never reopens it: only staff do.
      // The `ticket.updated` event, or the next refetch, corrects anything this guess got wrong.
      const reopens = state.status === "pending";
      return {
        ...state,
        messages,
        status: reopens ? "open" : state.status,
        updatedAt: notOlder(action.message.createdAt, state.updatedAt) ? action.message.createdAt : state.updatedAt,
      };
    }
    case "closed":
      // The dates come with the `ticket.updated` event or the read this refusal asks for.
      return state.status === "resolved" ? state : { ...state, status: "resolved" };
    case "updated": {
      if (!notOlder(action.data.updatedAt, state.updatedAt)) return state;
      const { status, updatedAt, resolvedAt } = action.data;
      return { ...state, status, updatedAt, resolvedAt };
    }
    case "read": {
      if (action.by === "you") {
        return action.upToMessageId > state.seenByYou ? { ...state, seenByYou: action.upToMessageId } : state;
      }
      return action.upToMessageId > state.seenBySupport ? { ...state, seenBySupport: action.upToMessageId } : state;
    }
    case "snapshot": {
      const { source } = action;
      let messages = state.messages;
      for (const message of source.messages) messages = insertMessage(messages, message);
      const fresh = notOlder(source.updatedAt, state.updatedAt);
      return {
        ...state,
        messages,
        ...(fresh
          ? {
              status: source.status,
              updatedAt: source.updatedAt,
              resolvedAt: source.resolvedAt,
            }
          : {}),
        seenByYou: Math.max(state.seenByYou, source.seenByYou ?? 0),
        seenBySupport: Math.max(state.seenBySupport, source.seenBySupport ?? 0),
      };
    }
  }
}

/**
 * The receipt under the visitor's last message: `seen` when support has seen it, else `sent`; null when the visitor
 * wrote nothing yet. Only the LAST message of the visitor carries one (`messageId`).
 */
export function receiptOf(state: ConversationState): { messageId: number; seen: boolean } | null {
  const messageId = lastIdFrom(state.messages, "you");
  return messageId === 0 ? null : { messageId, seen: state.seenBySupport >= messageId };
}

/**
 * The message id to tell the API the visitor has read up to, or null when nothing is to be sent: only while the tab is
 * visible and the end of the conversation is on screen, only for support messages newer than what is already marked
 * (by the server's mark or by the last call made here).
 */
export function nextReadMark(input: {
  lastSupportId: number;
  seenByYou: number;
  /** The highest id this page already asked to mark (0: none). */
  markedUpTo: number;
  visible: boolean;
  onScreen: boolean;
}): number | null {
  if (!input.visible || !input.onScreen) return null;
  if (input.lastSupportId <= 0) return null;
  if (input.lastSupportId <= input.seenByYou || input.lastSupportId <= input.markedUpTo) return null;
  return input.lastSupportId;
}
