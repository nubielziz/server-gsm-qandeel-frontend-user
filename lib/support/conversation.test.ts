import { describe, expect, it } from "vitest";
import type { TicketMessage } from "@/lib/api/types";
import {
  conversationReducer,
  initialState,
  insertMessage,
  lastIdFrom,
  nextReadMark,
  receiptOf,
  shouldSendTyping,
  typingActive,
  TYPING_SEND_GAP_MS,
  TYPING_SHOW_MS,
  type TicketSource,
} from "./conversation";

const message = (id: number, from: "you" | "support", extra: Partial<TicketMessage> = {}): TicketMessage => ({
  id,
  from,
  body: `message ${id}`,
  createdAt: `2026-11-15T10:00:${String(id).padStart(2, "0")}.000Z`,
  ...extra,
});

const source = (overrides: Partial<TicketSource> = {}): TicketSource => ({
  status: "open",
  updatedAt: "2026-11-15T10:00:10.000Z",
  resolvedAt: null,
  canRate: false,
  csatScore: null,
  messages: [message(1, "you"), message(2, "support")],
  ...overrides,
});

const start = (overrides: Partial<TicketSource> = {}) => initialState(source(overrides));

describe("initialState: the ticket the server read", () => {
  it("is the first state: messages by id, no duplicate, attachments always present", () => {
    const state = initialState(source({ messages: [message(3, "you"), message(1, "you"), message(2, "support"), message(2, "support")] }));
    expect(state.messages.map((m) => m.id)).toEqual([1, 2, 3]);
    expect(state.messages.every((m) => Array.isArray(m.attachments))).toBe(true);
  });

  it("starts with no seen marks and no typing when the answer has none (an older backend)", () => {
    const state = start();
    expect([state.seenByYou, state.seenBySupport, state.typingUntil]).toEqual([0, 0, 0]);
    expect(state.canRate).toBe(false);
    expect(state.csatScore).toBeNull();
  });

  it("takes the seen marks and the rating the server sent", () => {
    const state = start({ seenByYou: 2, seenBySupport: 1, canRate: true, csatScore: 4 });
    expect([state.seenByYou, state.seenBySupport, state.canRate, state.csatScore]).toEqual([2, 1, true, 4]);
  });
});

describe("messages: id order, once each", () => {
  it("appends a new message at the end and keeps the order by id when one arrives late", () => {
    let state = start();
    state = conversationReducer(state, { type: "message", message: message(5, "support") });
    state = conversationReducer(state, { type: "message", message: message(4, "you") });
    expect(state.messages.map((m) => m.id)).toEqual([1, 2, 4, 5]);
  });

  it("ignores a message whose id is already there and returns the same state object", () => {
    const state = start();
    expect(conversationReducer(state, { type: "message", message: message(2, "support", { body: "again" }) })).toBe(state);
  });

  it("insertMessage returns the same array for a known id", () => {
    const state = start();
    expect(insertMessage(state.messages, message(1, "you"))).toBe(state.messages);
  });

  it("the answer of the POST is appended, and the event with the same id that follows is ignored", () => {
    let state = start();
    state = conversationReducer(state, { type: "sent", message: message(6, "you") });
    const after = conversationReducer(state, { type: "message", message: message(6, "you") });
    expect(after).toBe(state);
    expect(state.messages.map((m) => m.id)).toEqual([1, 2, 6]);
  });

  it("the event can come first: the answer of the POST then adds nothing", () => {
    let state = start();
    state = conversationReducer(state, { type: "message", message: message(6, "you") });
    state = conversationReducer(state, { type: "sent", message: message(6, "you") });
    expect(state.messages.map((m) => m.id)).toEqual([1, 2, 6]);
  });

  it("keeps the attachments of a message", () => {
    const file = { id: 9, filename: "scan.pdf", mime: "application/pdf", size: 1200 };
    const state = conversationReducer(start(), { type: "message", message: message(7, "support", { attachments: [file] }) });
    expect(state.messages[2].attachments).toEqual([file]);
  });

  it("lastIdFrom finds the newest message of one side, 0 when there is none", () => {
    const state = start();
    expect(lastIdFrom(state.messages, "you")).toBe(1);
    expect(lastIdFrom(state.messages, "support")).toBe(2);
    expect(lastIdFrom([], "support")).toBe(0);
  });
});

describe("sent: the visitor writing reopens the ticket", () => {
  it("moves a resolved or pending ticket back to open, clears the resolved date and the rating form", () => {
    for (const status of ["resolved", "pending"] as const) {
      const state = start({ status, resolvedAt: status === "resolved" ? "2026-11-15T10:00:09.000Z" : null, canRate: status === "resolved" });
      const next = conversationReducer(state, { type: "sent", message: message(8, "you") });
      expect(next.status).toBe("open");
      expect(next.resolvedAt).toBeNull();
      expect(next.canRate).toBe(false);
    }
  });

  it("leaves an open or new ticket as it is", () => {
    for (const status of ["open", "new"] as const) {
      expect(conversationReducer(start({ status }), { type: "sent", message: message(8, "you") }).status).toBe(status);
    }
  });

  it("does not move the update time back", () => {
    const state = start({ updatedAt: "2026-11-15T12:00:00.000Z" });
    expect(conversationReducer(state, { type: "sent", message: message(8, "you") }).updatedAt).toBe("2026-11-15T12:00:00.000Z");
  });
});

describe("updated and snapshot: never older data over newer", () => {
  const data = (updatedAt: string, status: "open" | "resolved" = "resolved") => ({
    status,
    updatedAt,
    resolvedAt: status === "resolved" ? updatedAt : null,
    canRate: status === "resolved",
    csatScore: null,
  });

  it("applies a newer ticket.updated", () => {
    const state = conversationReducer(start(), { type: "updated", data: data("2026-11-15T10:05:00.000Z") });
    expect([state.status, state.canRate, state.updatedAt]).toEqual(["resolved", true, "2026-11-15T10:05:00.000Z"]);
  });

  it("ignores an older one and returns the same state", () => {
    const state = start();
    expect(conversationReducer(state, { type: "updated", data: data("2026-11-15T09:00:00.000Z") })).toBe(state);
  });

  it("a snapshot adds the messages it brings and the newer status", () => {
    const next = conversationReducer(start(), {
      type: "snapshot",
      source: source({ status: "resolved", updatedAt: "2026-11-15T10:30:00.000Z", resolvedAt: "2026-11-15T10:30:00.000Z", canRate: true, messages: [message(1, "you"), message(2, "support"), message(3, "support")], seenBySupport: 1 }),
    });
    expect(next.messages.map((m) => m.id)).toEqual([1, 2, 3]);
    expect([next.status, next.canRate, next.seenBySupport]).toEqual(["resolved", true, 1]);
  });

  it("an older snapshot keeps the newer status but still learns new messages and marks", () => {
    const state = start({ status: "resolved", updatedAt: "2026-11-15T11:00:00.000Z", canRate: true });
    const next = conversationReducer(state, {
      type: "snapshot",
      source: source({ status: "open", updatedAt: "2026-11-15T10:00:00.000Z", messages: [message(1, "you"), message(2, "support"), message(3, "support")], seenByYou: 2 }),
    });
    expect(next.status).toBe("resolved");
    expect(next.messages.map((m) => m.id)).toEqual([1, 2, 3]);
    expect(next.seenByYou).toBe(2);
  });

  it("a snapshot never lowers a seen mark", () => {
    const state = start({ seenByYou: 5, seenBySupport: 4 });
    const next = conversationReducer(state, { type: "snapshot", source: source({ seenByYou: 1, seenBySupport: 1 }) });
    expect([next.seenByYou, next.seenBySupport]).toEqual([5, 4]);
  });

  it("the rating form's answer ends the rating", () => {
    const state = start({ status: "resolved", canRate: true });
    const next = conversationReducer(state, { type: "rated", csatScore: 5 });
    expect([next.canRate, next.csatScore]).toEqual([false, 5]);
  });
});

describe("seen marks: one per side, forward only", () => {
  it("moves a mark forward and never back", () => {
    let state = start();
    state = conversationReducer(state, { type: "read", by: "support", upToMessageId: 1 });
    expect(state.seenBySupport).toBe(1);
    const same = conversationReducer(state, { type: "read", by: "support", upToMessageId: 1 });
    expect(same).toBe(state);
    expect(conversationReducer(state, { type: "read", by: "support", upToMessageId: 0 })).toBe(state);
    state = conversationReducer(state, { type: "read", by: "you", upToMessageId: 2 });
    expect([state.seenByYou, state.seenBySupport]).toEqual([2, 1]);
  });

  it("the receipt sits under the visitor's LAST message: Sent, then Seen once support's mark reaches it", () => {
    let state = start();
    expect(receiptOf(state)).toEqual({ messageId: 1, seen: false });
    state = conversationReducer(state, { type: "sent", message: message(3, "you") });
    expect(receiptOf(state)).toEqual({ messageId: 3, seen: false });
    state = conversationReducer(state, { type: "read", by: "support", upToMessageId: 1 });
    expect(receiptOf(state)).toEqual({ messageId: 3, seen: false });
    state = conversationReducer(state, { type: "read", by: "support", upToMessageId: 3 });
    expect(receiptOf(state)).toEqual({ messageId: 3, seen: true });
  });

  it("has no receipt before the visitor wrote anything", () => {
    expect(receiptOf(start({ messages: [message(2, "support")] }))).toBeNull();
  });
});

describe("support is typing: 6 s, ended by its message", () => {
  it("shows for 6 s after the last typing event and ends on the tick", () => {
    let state = conversationReducer(start(), { type: "typing", now: 1_000 });
    expect(state.typingUntil).toBe(1_000 + TYPING_SHOW_MS);
    expect(typingActive(state, 6_999)).toBe(true);
    expect(typingActive(state, 7_000)).toBe(false);
    // Another event moves the end.
    state = conversationReducer(state, { type: "typing", now: 5_000 });
    expect(state.typingUntil).toBe(5_000 + TYPING_SHOW_MS);
    expect(conversationReducer(state, { type: "tick", now: 10_999 })).toBe(state);
    expect(conversationReducer(state, { type: "tick", now: 11_000 }).typingUntil).toBe(0);
  });

  it("a tick with nothing showing changes nothing", () => {
    const state = start();
    expect(conversationReducer(state, { type: "tick", now: 99_999 })).toBe(state);
  });

  it("ends when a message from support arrives, but not for the visitor's own message", () => {
    const typing = conversationReducer(start(), { type: "typing", now: 1_000 });
    expect(conversationReducer(typing, { type: "message", message: message(9, "support") }).typingUntil).toBe(0);
    expect(conversationReducer(typing, { type: "message", message: message(9, "you") }).typingUntil).toBe(1_000 + TYPING_SHOW_MS);
  });
});

describe("nextReadMark: seen only when visible and the end is on screen", () => {
  const base = { lastSupportId: 4, seenByYou: 2, markedUpTo: 0, visible: true, onScreen: true };

  it("marks the newest support message when everything holds", () => {
    expect(nextReadMark(base)).toBe(4);
  });

  it("sends nothing in a hidden tab or when the end of the conversation is not on screen", () => {
    expect(nextReadMark({ ...base, visible: false })).toBeNull();
    expect(nextReadMark({ ...base, onScreen: false })).toBeNull();
  });

  it("sends nothing when the server's mark or the last call already covers it, or support wrote nothing", () => {
    expect(nextReadMark({ ...base, seenByYou: 4 })).toBeNull();
    expect(nextReadMark({ ...base, seenByYou: 9 })).toBeNull();
    expect(nextReadMark({ ...base, markedUpTo: 4 })).toBeNull();
    expect(nextReadMark({ ...base, lastSupportId: 0, seenByYou: 0 })).toBeNull();
  });

  it("sends again for a newer message", () => {
    expect(nextReadMark({ ...base, markedUpTo: 4, lastSupportId: 7 })).toBe(7);
  });
});

describe("shouldSendTyping: at most once every 3 s, never for an empty box", () => {
  it("sends the first ping, then waits 3 s", () => {
    expect(shouldSendTyping({ text: "h", lastSentAt: null, now: 0 })).toBe(true);
    expect(shouldSendTyping({ text: "he", lastSentAt: 0, now: TYPING_SEND_GAP_MS - 1 })).toBe(false);
    expect(shouldSendTyping({ text: "hel", lastSentAt: 0, now: TYPING_SEND_GAP_MS })).toBe(true);
  });

  it("sends nothing for an empty or blank box", () => {
    expect(shouldSendTyping({ text: "", lastSentAt: null, now: 0 })).toBe(false);
    expect(shouldSendTyping({ text: "   \n", lastSentAt: null, now: 0 })).toBe(false);
  });

  it("a long burst of keystrokes sends one ping per 3 s window", () => {
    let last: number | null = null;
    let pings = 0;
    for (let now = 0; now < 10_000; now += 100) {
      if (shouldSendTyping({ text: "typing", lastSentAt: last, now })) {
        last = now;
        pings += 1;
      }
    }
    expect(pings).toBe(4); // 0, 3000, 6000, 9000
  });
});
