import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { common } from "@/lib/i18n/messages/common";
import { support } from "@/lib/i18n/messages/support";
import { TicketList, type TicketListRow } from "./ticket-list";

const row = (number: string, extra: Partial<TicketListRow> = {}): TicketListRow => ({
  key: number,
  href: `/en/support/tickets/tok-${number}`,
  number,
  subject: `Subject of ${number}`,
  category: "delay",
  status: "open",
  updatedAt: "2026-11-15T10:00:00.000Z",
  lastMessageAt: "2026-11-15T10:05:00.000Z",
  lastMessageFrom: "support",
  hasUnread: false,
  ...extra,
});

const render = (rows: TicketListRow[]) => renderToStaticMarkup(<TicketList rows={rows} t={support} c={common} />);

describe("TicketList: one markup for every screen", () => {
  it("is a single table with one row per ticket (no second, phone-only list)", () => {
    const html = render([row("T-1"), row("T-2"), row("T-3")]);
    expect(html.match(/<table/g)).toHaveLength(1);
    expect(html.match(/data-ticket-number=/g)).toHaveLength(3);
    expect(html).toContain("Your support tickets");
    expect(html).toContain("Subject of T-2");
  });

  it("links the number to the ticket without prefetching it, with a name that says which ticket", () => {
    const html = render([row("T-1")]);
    expect(html).toContain('href="/en/support/tickets/tok-T-1"');
    expect(html).toContain('aria-label="Open ticket T-1"');
  });

  it("marks a ticket with a reply not yet seen: a dot for the eye, the words in the link's name", () => {
    const html = render([row("T-1", { hasUnread: true }), row("T-2")]);
    expect(html).toContain('aria-label="Open ticket T-1 · New reply"');
    expect(html).toContain('aria-label="Open ticket T-2"');
    expect(html.match(/rounded-full bg-danger/g)).toHaveLength(1);
  });

  it("says who wrote last", () => {
    expect(render([row("T-1", { lastMessageFrom: "you" })])).toContain("You wrote");
    expect(render([row("T-1", { lastMessageFrom: "support" })])).toContain("Support replied");
    expect(render([row("T-1", { lastMessageFrom: null, lastMessageAt: null })])).toContain("No messages yet");
  });

  it("shows the status badge and the topic", () => {
    const html = render([row("T-1", { status: "resolved", category: "refund" })]);
    expect(html).toContain("Resolved");
    expect(html).toContain("Refund");
  });
});
