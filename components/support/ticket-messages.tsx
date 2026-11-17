// TicketMessages: the conversation, oldest first (Support Tickets mockup). Your messages sit on the end side in a grey
// bubble, the team's on the start side in a white bordered bubble with a small avatar. A date line separates days.
// Pure and presentational (feature 28): no hooks, no data of its own. `TicketConversation` owns the state and hands the
// messages in; the list is a `role="log"` live region, so a message that arrives is announced by screen readers.
// Message text is plain text (React escapes it); line breaks are kept. A file on a message is a download link (opens in a
// new tab, never an inline preview): the API answers the link with a 302 to a short-lived address.
import { FileText } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import type { SupportMessages } from "@/lib/i18n/messages/support";
import { formatFileSize } from "@/lib/support/attachments";
import type { ConversationMessage } from "@/lib/support/conversation";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";

export type TicketMessagesProps = {
  messages: readonly ConversationMessage[];
  locale: Locale;
  t: Pick<SupportMessages["ticket"], "conversation" | "you" | "team" | "sentAt"> & {
    chat: Pick<SupportMessages["ticket"]["chat"], "sent" | "seen" | "attachments" | "opensNewTab">;
  };
  /** The download link of a file of this ticket. */
  fileHref(fileId: number): string;
  /** The receipt (`Sent` / `Seen`) goes under the visitor's last message only. */
  receipt: { messageId: number; seen: boolean } | null;
};

export function TicketMessages({ messages, locale, t, fileHref, receipt }: TicketMessagesProps) {
  return (
    <ol role="log" aria-label={t.conversation} aria-live="polite" className="grid gap-4">
      {messages.map((message, index) => {
        const mine = message.from === "you";
        const day = message.createdAt.slice(0, 10);
        const showDay = index === 0 || day !== messages[index - 1].createdAt.slice(0, 10);
        const who = mine ? t.you : t.team;
        const receiptText = receipt && receipt.messageId === message.id ? (receipt.seen ? t.chat.seen : t.chat.sent) : null;
        return (
          <li key={message.id} data-message-id={message.id} className="grid gap-4">
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
                {/* dir="auto": a message typed in another script (Arabic, for one) keeps its own punctuation and alignment. */}
                <div
                  dir="auto"
                  className={cn(
                    "break-words rounded-card px-4 py-3 text-body text-ink",
                    mine ? "bg-surface-sunken" : "border border-line bg-surface",
                  )}
                >
                  {message.body ? <p className="whitespace-pre-wrap">{message.body}</p> : null}
                  {message.attachments.length > 0 ? (
                    <ul aria-label={t.chat.attachments} className={cn("grid justify-items-start gap-1", message.body && "mt-2")}>
                      {message.attachments.map((file) => (
                        <li key={file.id} className="max-w-full">
                          <a
                            href={fileHref(file.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 max-w-full items-center gap-2 font-semibold underline decoration-1 underline-offset-4 hover:decoration-2"
                          >
                            <FileText aria-hidden="true" className="size-4 shrink-0" />
                            <bdi className="min-w-0 truncate">{file.filename}</bdi>
                            <span className="num shrink-0 font-normal text-ink-subtle">{formatFileSize(file.size, locale)}</span>
                            <span className="sr-only">{t.chat.opensNewTab}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <p className={cn("mt-1 text-caption text-ink-subtle", mine && "text-end")}>
                  {fmt(t.sentAt, { who, time: formatDate(message.createdAt, locale, { timeStyle: "short" }) })}
                  {receiptText ? ` · ${receiptText}` : null}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
