// Group C (decision 039, plan 30 §9.5): Arabic that a person types is data, and English only does not change how it is
// shown. A ticket message keeps its own direction (`dir="auto"`), a file name and a value of the API are isolated
// (`<bdi>`), a name in Arabic gives an initial, and the Enter that confirms an input method's text does not send. The
// samples are real Arabic script on purpose (this file is on the allowlist of scripts/english-only.config.json).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Avatar, initialsOf } from "@/components/ui/avatar";
import { BdiText } from "@/components/store/bdi-text";
import { TicketMessages } from "@/components/support/ticket-messages";
import { support } from "@/lib/i18n/messages/support";
import { sendsMessage } from "@/lib/support/send-key";
import type { ConversationMessage } from "@/lib/support/conversation";

const body = "مرحبا، جهازي لا يعمل <b>";
const fileName = "إيصال الدفع (1).pdf";
const name = "سارة أحمد";

const message = (id: number, from: "you" | "support", text: string, attachments: ConversationMessage["attachments"] = []): ConversationMessage => ({
  id,
  from,
  body: text,
  createdAt: `2026-11-15T10:0${id}:00.000Z`,
  attachments,
});

function render(messages: ConversationMessage[]) {
  const t = support.ticket;
  return renderToStaticMarkup(
    <TicketMessages
      messages={messages}
      t={{ conversation: t.conversation, you: t.you, team: t.team, sentAt: t.sentAt, chat: t.chat }}
      fileHref={(id) => `/store/v1/tickets/tok/files/${id}`}
      receipt={null}
    />,
  );
}

describe("a ticket message typed in Arabic", () => {
  it("is shown as typed and escaped, in a box that takes the direction of its own text", () => {
    const html = render([message(1, "you", body)]);
    expect(html).toMatch(/<div dir="auto"[^>]*><p class="whitespace-pre-wrap">مرحبا، جهازي لا يعمل &lt;b&gt;<\/p>/);
    expect(html).not.toContain("<b>");
  });

  it("keeps the same box for a reply of the team", () => {
    const html = render([message(2, "support", body)]);
    expect(html.match(/dir="auto"/g)).toHaveLength(1);
  });

  it("isolates the name of an attached file, so its direction cannot reorder the text around it", () => {
    const html = render([message(1, "you", "", [{ id: 9, filename: fileName, mime: "application/pdf", size: 340 * 1024 }])]);
    expect(html).toContain(`<bdi class="min-w-0 truncate">${fileName}</bdi>`);
    expect(html).toContain('href="/store/v1/tickets/tok/files/9"');
  });
});

describe("a value of the API in another script", () => {
  it("is isolated inside the English sentence it stands in", () => {
    const html = renderToStaticMarkup(<BdiText template="Ready within {time}." value="يومان" />);
    expect(html).toBe("Ready within <bdi>يومان</bdi>.");
  });

  it("leaves a sentence with no placeholder as it is", () => {
    expect(renderToStaticMarkup(<BdiText template="Ready soon." value="يومان" />)).toBe("Ready soon.");
  });
});

describe("the initials of a name typed in Arabic", () => {
  it("are the first letters of the first and last word", () => {
    expect(initialsOf(name)).toBe("سأ");
    expect(initialsOf("سارة")).toBe("س");
    expect(initialsOf("Alex Morgan")).toBe("AM");
    expect(initialsOf("   ")).toBe("?");
  });

  it("show in the badge as they are", () => {
    expect(renderToStaticMarkup(<Avatar name={name} />)).toContain(">سأ<");
  });
});

describe("the Enter key of the reply box", () => {
  it("sends on Enter", () => {
    expect(sendsMessage({ key: "Enter", shiftKey: false, isComposing: false })).toBe(true);
  });

  it("starts a new line on Shift+Enter and ignores other keys", () => {
    expect(sendsMessage({ key: "Enter", shiftKey: true, isComposing: false })).toBe(false);
    expect(sendsMessage({ key: "a", shiftKey: false, isComposing: false })).toBe(false);
  });

  it("does not send while an input method confirms its text (Arabic, Chinese, Japanese)", () => {
    expect(sendsMessage({ key: "Enter", shiftKey: false, isComposing: true })).toBe(false);
  });
});
