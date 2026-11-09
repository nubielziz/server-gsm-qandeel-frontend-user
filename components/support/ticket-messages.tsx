// TicketMessages: the conversation, oldest first (Support Tickets mockup). Your messages sit on the end side in a grey
// bubble, the team's on the start side in a white bordered bubble with a small avatar. A date line separates days.
// Server component. Message text is plain text (React escapes it); line breaks are kept.
import type { TicketMessage } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { support } from "@/lib/i18n/messages/support";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";

export async function TicketMessages({ messages }: { messages: TicketMessage[] }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages(support)]);

  return (
    <ol role="log" aria-label={t.ticket.conversation} aria-live="polite" className="grid gap-4">
      {messages.map((message, index) => {
        const mine = message.from === "you";
        const day = message.createdAt.slice(0, 10);
        const showDay = index === 0 || day !== messages[index - 1].createdAt.slice(0, 10);
        const who = mine ? t.ticket.you : t.ticket.team;
        return (
          <li key={message.id} className="grid gap-4">
            {showDay ? (
              <p className="flex items-center gap-4 text-small text-ink-subtle">
                <span aria-hidden="true" className="h-px flex-1 bg-line" />
                <time dateTime={message.createdAt}>{formatDate(message.createdAt, locale, { dateStyle: "long" })}</time>
                <span aria-hidden="true" className="h-px flex-1 bg-line" />
              </p>
            ) : null}
            <div className={cn("flex items-end gap-3", mine ? "justify-end" : "justify-start")}>
              {mine ? null : <Avatar name="GSM Store" size="sm" />}
              <div className="min-w-0 max-w-[88%] sm:max-w-[75%]">
                {/* dir="auto": a message in the other language keeps its own punctuation and alignment. */}
                <div
                  dir="auto"
                  className={cn(
                    "whitespace-pre-wrap break-words rounded-card px-4 py-3 text-body text-ink",
                    mine ? "bg-surface-sunken" : "border border-line bg-surface",
                  )}
                >
                  {message.body}
                </div>
                <p className={cn("mt-1 text-caption text-ink-subtle", mine && "text-end")}>
                  {fmt(t.ticket.sentAt, { who, time: formatDate(message.createdAt, locale, { timeStyle: "short" }) })}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
