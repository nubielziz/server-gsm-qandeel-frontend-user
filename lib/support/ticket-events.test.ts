import { describe, expect, it } from "vitest";
import { isAbout, messageOf, parseTicketFrame, ticketDedupeKey, TICKET_EVENT_NAMES } from "./ticket-events";

const json = (value: unknown) => JSON.stringify(value);
const message = { id: 41, from: "support", body: "Hello", createdAt: "2026-11-15T10:00:00.000Z", attachments: [] };

describe("parseTicketFrame: ticket.message.created", () => {
  it("reads a customer's event (no ticket id, matched by number) and keeps `live`", () => {
    const data = parseTicketFrame("ticket.message.created", json({ ticketId: null, number: "T-1042", message, live: true }));
    expect(data).toEqual({ ticketId: null, number: "T-1042", message, live: true });
  });

  it("reads a merchant's event with the ticket id; `live` is false unless it says true (a replay)", () => {
    const data = parseTicketFrame("ticket.message.created", json({ ticketId: 7, number: "T-7", message, live: false }));
    expect(data).toMatchObject({ ticketId: 7, number: "T-7", live: false });
  });

  it("gives a message with no attachments key an empty list, and drops a malformed file", () => {
    const { attachments: _unused, ...bare } = message;
    void _unused;
    expect(messageOf(bare)?.attachments).toEqual([]);
    const withFiles = messageOf({ ...message, attachments: [{ id: 3, filename: "a.pdf", mime: "application/pdf", size: 10 }, { id: "x" }, null] });
    expect(withFiles?.attachments).toEqual([{ id: 3, filename: "a.pdf", mime: "application/pdf", size: 10 }]);
  });

  it("accepts a message with an empty body (files only)", () => {
    expect(messageOf({ ...message, body: "" })?.body).toBe("");
  });

  it("drops frames the page does not understand", () => {
    expect(parseTicketFrame("ticket.message.created", "not json")).toBeUndefined();
    expect(parseTicketFrame("ticket.message.created", json({ number: "T-1" }))).toBeUndefined();
    expect(parseTicketFrame("ticket.message.created", json({ number: "", message }))).toBeUndefined();
    expect(parseTicketFrame("ticket.message.created", json({ number: "T-1", ticketId: "7", message }))).toBeUndefined();
    expect(parseTicketFrame("ticket.message.created", json({ number: "T-1", message: { ...message, from: "staff" } }))).toBeUndefined();
    expect(parseTicketFrame("ticket.message.created", json({ number: "T-1", message: { ...message, id: 0 } }))).toBeUndefined();
  });
});

describe("parseTicketFrame: the state events", () => {
  it("reads ticket.updated", () => {
    const data = parseTicketFrame(
      "ticket.updated",
      json({ ticketId: null, number: "T-9", status: "resolved", updatedAt: "2026-11-15T10:00:00.000Z", resolvedAt: "2026-11-15T10:00:00.000Z", hasUnread: true }),
    );
    expect(data).toEqual({
      ticketId: null,
      number: "T-9",
      status: "resolved",
      updatedAt: "2026-11-15T10:00:00.000Z",
      resolvedAt: "2026-11-15T10:00:00.000Z",
      hasUnread: true,
    });
  });

  it("ignores the rating keys an older backend still sends in ticket.updated", () => {
    const data = parseTicketFrame(
      "ticket.updated",
      json({ ticketId: null, number: "T-9", status: "resolved", updatedAt: "2026-11-15T10:00:00.000Z", resolvedAt: "2026-11-15T10:00:00.000Z", canRate: true, csatScore: 4, hasUnread: false }),
    );
    expect(data).toEqual({
      ticketId: null,
      number: "T-9",
      status: "resolved",
      updatedAt: "2026-11-15T10:00:00.000Z",
      resolvedAt: "2026-11-15T10:00:00.000Z",
      hasUnread: false,
    });
    expect(data).not.toHaveProperty("canRate");
    expect(data).not.toHaveProperty("csatScore");
  });

  it("drops a ticket.updated with an unknown status", () => {
    expect(parseTicketFrame("ticket.updated", json({ number: "T-9", status: "closed", updatedAt: "2026-11-15T10:00:00.000Z" }))).toBeUndefined();
  });

  it("reads ticket.read", () => {
    expect(parseTicketFrame("ticket.read", json({ ticketId: 3, number: "T-3", by: "support", upToMessageId: 12, at: "2026-11-15T10:00:00.000Z" }))).toEqual({
      ticketId: 3,
      number: "T-3",
      by: "support",
      upToMessageId: 12,
      at: "2026-11-15T10:00:00.000Z",
    });
    expect(parseTicketFrame("ticket.read", json({ number: "T-3", by: "staff", upToMessageId: 12 }))).toBeUndefined();
  });

  it("drops ticket.typing, which an older backend may still send", () => {
    expect(parseTicketFrame("ticket.typing", json({ ticketId: null, number: "T-3" }))).toBeUndefined();
    expect(parseTicketFrame("ticket.typing", json({ ticketId: 3, number: "T-3", by: "support" }))).toBeUndefined();
  });

  it("passes the stream's own events through the base parser and drops an unknown name", () => {
    expect(parseTicketFrame("hb", "1794735015")).toBe(1794735015);
    expect(parseTicketFrame("bye", json({ reason: "max_age" }))).toEqual({ reason: "max_age" });
    expect(parseTicketFrame("ticket.exploded", "{}")).toBeUndefined();
  });

  it("lists the three ticket events", () => {
    expect([...TICKET_EVENT_NAMES]).toEqual(["ticket.message.created", "ticket.updated", "ticket.read"]);
  });
});

describe("ticketDedupeKey", () => {
  it("names a message by its id and nothing else (the others are state and may repeat)", () => {
    expect(ticketDedupeKey("ticket.message.created", { message })).toBe("message:41");
    expect(ticketDedupeKey("ticket.updated", { message })).toBeNull();
    expect(ticketDedupeKey("ticket.message.created", { number: "T-1" })).toBeNull();
    expect(ticketDedupeKey("ticket.message.created", null)).toBeNull();
  });
});

describe("isAbout: whose event is it", () => {
  it("matches a merchant's ticket by id, a customer's by number", () => {
    expect(isAbout({ ticketId: 7, number: "T-7" }, { id: 7, number: "T-7" })).toBe(true);
    expect(isAbout({ ticketId: 8, number: "T-8" }, { id: 7, number: "T-7" })).toBe(false);
    expect(isAbout({ ticketId: null, number: "T-1042" }, { number: "T-1042" })).toBe(true);
    expect(isAbout({ ticketId: null, number: "T-1043" }, { number: "T-1042" })).toBe(false);
  });

  it("falls back to the number when one side has no id", () => {
    expect(isAbout({ ticketId: null, number: "T-7" }, { id: 7, number: "T-7" })).toBe(true);
    expect(isAbout({ ticketId: 7, number: "T-7" }, { number: "T-7" })).toBe(true);
  });
});
