// Server-rendered markup of the live ticket parts (the state machine is tested in lib/support/*.test.ts; the stream and the
// timers need a browser and are covered by e2e/support-live.spec.ts). What this guards: the first state is the server's ticket,
// the receipt, the reserved lines, the files as plain links, the rating only for customers, the hints by status, a message
// typed in Arabic (user text, shown as typed), that the reply box and the attach control are real labelled controls, and that
// a resolved ticket shows the closed notice instead of them (owner, 2026-11-15).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { errors } from "@/lib/i18n/messages/errors";
import { support } from "@/lib/i18n/messages/support";
import type { TicketMessage } from "@/lib/api/types";
import type { TicketSource } from "@/lib/support/conversation";
import { LiveTicketFacts, LiveTicketStatus, TicketConversation, TicketLive, type TicketAccess } from "./ticket-conversation";

const statuses = { new: "New", open: "In progress", pending: "Awaiting reply", resolved: "Resolved" };
const file = { id: 9, filename: "scan <1>.pdf", mime: "application/pdf", size: 340 * 1024 };

const message = (id: number, from: "you" | "support", body: string, extra: Partial<TicketMessage> = {}): TicketMessage => ({
  id,
  from,
  body,
  createdAt: `2026-11-15T10:0${id}:00.000Z`,
  ...extra,
});

const source = (overrides: Partial<TicketSource> = {}): TicketSource => ({
  status: "open",
  updatedAt: "2026-11-15T10:09:00.000Z",
  resolvedAt: null,
  canRate: false,
  csatScore: null,
  messages: [message(1, "you", "My unlock is slow"), message(2, "support", "We are on it", { attachments: [file] })],
  ...overrides,
});

function render(options: { source?: TicketSource; access?: TicketAccess; newTicketHref?: string } = {}) {
  const t = support.ticket;
  return renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <TicketLive number="T-1042" access={options.access ?? { kind: "token", token: "tok" }} source={options.source ?? source()}>
        <LiveTicketStatus labels={statuses} />
        <TicketConversation
          newTicketHref={options.newTicketHref ?? "/en/support"}
          t={{ conversation: t.conversation, you: t.you, team: t.team, sentAt: t.sentAt, reply: t.reply, csat: t.csat, chat: t.chat, closed: t.closed }}
        />
      </TicketLive>
    </ErrorTextProvider>,
  );
}

describe("TicketConversation: the first state is the ticket the server read", () => {
  it("renders the messages in the order of their id as a live log, with their ids on the rows", () => {
    const html = render({ source: source({ messages: [message(3, "support", "third"), message(1, "you", "first"), message(2, "support", "second")] }) });
    expect(html).toContain('role="log"');
    expect(html.match(/data-message-id="(\d+)"/g)).toEqual(['data-message-id="1"', 'data-message-id="2"', 'data-message-id="3"']);
    expect(html.indexOf("first")).toBeLessThan(html.indexOf("second"));
    expect(html.indexOf("second")).toBeLessThan(html.indexOf("third"));
  });

  it("shows the status of the page and keeps a message's line breaks and escapes its text", () => {
    const html = render({ source: source({ status: "pending", messages: [message(1, "you", "line one\n<b>line two</b>")] }) });
    expect(html).toContain("Awaiting reply");
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("line one\n&lt;b&gt;line two&lt;/b&gt;");
    expect(html).not.toContain("<b>line two</b>");
  });
});

describe("the receipt: Sent, then Seen, under the visitor's last message only", () => {
  it("says Sent while support's mark is behind", () => {
    const html = render({ source: source({ messages: [message(1, "you", "a"), message(2, "support", "b"), message(3, "you", "c")], seenBySupport: 1 }) });
    expect(html.match(/ · Sent/g)).toHaveLength(1);
    expect(html).not.toContain("· Seen");
    // It is under message 3, not message 1.
    expect(html.indexOf(" · Sent")).toBeGreaterThan(html.indexOf('data-message-id="3"'));
  });

  it("says Seen once support's mark reaches the last message", () => {
    const html = render({ source: source({ messages: [message(1, "you", "a"), message(2, "you", "b")], seenBySupport: 2 }) });
    expect(html.match(/ · Seen/g)).toHaveLength(1);
    expect(html).not.toContain("· Sent");
  });

  it("has no receipt when the visitor has not written", () => {
    const html = render({ source: source({ messages: [message(2, "support", "hello")] }) });
    expect(html).not.toMatch(/ · (Sent|Seen)/);
  });
});

describe("attachments are plain download links", () => {
  it("lists the file with its size, opening in a new tab, never inline", () => {
    const html = render();
    expect(html).toContain('href="/store/v1/tickets/tok/files/9"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("scan &lt;1&gt;.pdf");
    expect(html).toMatch(/340\s?kB/i);
    expect(html).toContain("(opens in a new tab)");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<iframe");
  });

  it("a merchant's file links to the ticket's own route by id", () => {
    const html = render({ access: { kind: "merchant", id: 42 } });
    expect(html).toContain('href="/client/tickets/42/files/9"');
  });

  it("a message with files only draws no empty text block", () => {
    const html = render({ source: source({ messages: [message(1, "you", "", { attachments: [file] })] }) });
    expect(html).toContain("scan");
    expect(html).not.toMatch(/<p class="whitespace-pre-wrap"><\/p>/);
  });
});

describe("the lines that must not move the page", () => {
  it("always renders the typing line (a polite live region, empty) and the connection line (silent until live)", () => {
    const html = render();
    expect(html).toMatch(/<p aria-live="polite"><\/p>/);
    expect(html).toContain('role="status"');
    expect(html).not.toContain("Connected");
    expect(html).not.toContain("Reconnecting");
    expect(html).not.toContain("Support is typing");
    // The "New message" button is not there until a message arrives out of sight.
    expect(html).not.toContain("New message");
  });
});

describe("the rating (customers only)", () => {
  it("offers the form when the ticket can be rated", () => {
    const html = render({ source: source({ status: "resolved", canRate: true }) });
    expect(html).toContain("How was our support?");
    expect(html).toContain("Send rating");
  });

  it("thanks the customer for a score already given and offers no form", () => {
    const html = render({ source: source({ status: "resolved", csatScore: 4 }) });
    expect(html).toContain("Thank you for rating this ticket 4 out of 5.");
    expect(html).not.toContain("Send rating");
  });

  it("a merchant never gets the form, whatever the answer says", () => {
    const html = render({ access: { kind: "merchant", id: 7 }, source: source({ status: "resolved", canRate: true }) });
    expect(html).not.toContain("Send rating");
  });
});

describe("the reply box", () => {
  it("is a labelled box with the Enter hint, a labelled attach control for PDF, JPG and PNG, and a send button", () => {
    const html = render();
    expect(html).toContain('name="body"');
    expect(html).toContain("Your reply");
    expect(html).toContain("Press Enter to send, Shift and Enter for a new line.");
    expect(html).toMatch(/<label[^>]*>[\s\S]*?Attach a file[\s\S]*?<input type="file" multiple="" accept="application\/pdf,image\/jpeg,image\/png,\.pdf,\.jpg,\.jpeg,\.png"/);
    expect(html).toContain("PDF, JPG or PNG, up to 5 MB, 5 files");
    expect(html).toContain("Send reply");
  });

  it("says why a reply matters by the live status", () => {
    expect(render({ source: source({ status: "pending" }) })).toContain("We are waiting for your reply.");
    const open = render({ source: source({ status: "open" }) });
    expect(open).not.toContain("We are waiting for your reply.");
    expect(open).not.toContain("This ticket is closed");
    // The notice's live region is always there (empty while the ticket is open), so a close is announced.
    expect(open).toMatch(/<div aria-live="polite"><\/div>/);
  });
});

describe("a resolved ticket is closed: the notice instead of the reply box", () => {
  it("has no reply box, no attach control and no send button, but the closed notice with the way to a new ticket", () => {
    const html = render({ source: source({ status: "resolved", resolvedAt: "2026-11-15T10:08:00.000Z" }), newTicketHref: "/en/account/tickets/new?order=12" });
    expect(html).not.toContain('name="body"');
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("Send reply");
    expect(html).not.toContain("Your reply reopens it");
    expect(html).toMatch(/<div aria-live="polite"><div tabindex="-1" role="group" aria-labelledby="[^"]+"/);
    expect(html).toContain("This ticket is closed</h3>");
    expect(html).toContain("If you still need help, open a new ticket.");
    expect(html).toMatch(/<a[^>]*href="\/en\/account\/tickets\/new\?order=12"[^>]*>Open a new ticket/);
    // Nothing was being written: no word about a discarded draft, no unsent text.
    expect(html).not.toContain("was not sent");
    expect(html).not.toContain('name="unsent"');
  });

  it("keeps the rating for a customer, and the conversation and its files readable", () => {
    const html = render({ source: source({ status: "resolved", canRate: true }) });
    expect(html).toContain("Send rating");
    expect(html).toContain("This ticket is closed");
    expect(html).toContain("We are on it");
    expect(html).toContain('href="/store/v1/tickets/tok/files/9"');
  });

  it("a merchant's closed thread offers the portal's new-ticket form", () => {
    const html = render({ access: { kind: "merchant", id: 7 }, source: source({ status: "resolved" }), newTicketHref: "/en/merchant/support/new" });
    expect(html).toMatch(/href="\/en\/merchant\/support\/new"[^>]*>Open a new ticket/);
    expect(html).not.toContain('name="body"');
  });
});

describe("a message typed in Arabic (user text, kept as typed)", () => {
  it("is shown as typed, escaped, inside a box that takes its own direction (dir=auto)", () => {
    const html = render({ source: source({ messages: [message(1, "you", "مرحبا <b>")] }) });
    expect(html).toMatch(/<div dir="auto"[^>]*><p class="whitespace-pre-wrap">مرحبا &lt;b&gt;<\/p>/);
  });
});

describe("LiveTicketFacts", () => {
  it("shows the last update and the status, and the resolved date only once there is one", () => {
    const labels = { updated: "Last update", resolved: "Resolved", status: "Status" };
    const open = renderToStaticMarkup(
      <TicketLive number="T-1" access={{ kind: "token", token: "t" }} source={source()}>
        <dl>
          <LiveTicketFacts labels={labels} statuses={statuses} />
        </dl>
      </TicketLive>,
    );
    expect(open).toContain("Last update");
    expect(open).toContain("In progress");
    expect(open).not.toContain(">Resolved<");
    const resolved = renderToStaticMarkup(
      <TicketLive number="T-1" access={{ kind: "token", token: "t" }} source={source({ status: "resolved", resolvedAt: "2026-11-15T10:08:00.000Z" })}>
        <dl>
          <LiveTicketFacts labels={labels} statuses={statuses} />
        </dl>
      </TicketLive>,
    );
    expect(resolved).toContain(">Resolved<");
  });
});

describe("outside <TicketLive>", () => {
  it("fails loudly instead of rendering a dead conversation", () => {
    expect(() => renderToStaticMarkup(<LiveTicketStatus labels={statuses} />)).toThrow(/TicketLive/);
  });
});
