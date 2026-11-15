"use client";
// The live ticket conversation (feature 28; backend plan `docs/briefs/28-support-live-chat.md` §2 and §4.2). One file, four
// parts, because they share one state:
// - `TicketLive`: the provider. It owns the state (`lib/support/conversation.ts`), the adapter (the customer's token or
//   the merchant's id), the stream and the refetch. It renders no markup of its own, so a server page can wrap its whole body
//   in it and keep the static parts as Server Components.
// - `TicketConversation`: the card body: the messages, the typing line, the reply form and the rating.
// - `LiveTicketStatus` and `LiveTicketFacts`: the status badge and the dates of the page, which change with the ticket.
// Rules this file keeps:
// - The ticket the server read is the FIRST state. The visitor's own message is added from the answer of the `POST`; the
//   event the stream sends for the same message is ignored by its id. Messages stay in the order of their id (no sorting by
//   time, no duplicate) whatever order they arrive in.
// - The customer's page opens its OWN stream (`GET /store/v1/tickets/<token>/stream`) through `createStream`, with one lock
//   per ticket (`gsm-ticket-<number>`): the tabs of a browser share one connection. The merchant's page listens on the
//   merchant stream (`lib/support/ticket-stream.ts`). The token never goes into an event: a customer's events are matched by
//   the ticket number.
// - Without a stream the ticket is read again every 30 s while the tab is visible. With one, the ticket is read again every
//   time the stream becomes live (it opens without a cursor, so nothing is replayed: the server's read and the first `ready`,
//   or a hidden page that shows again, would lose messages otherwise), and a lost doorbell is covered by the client's own
//   `stream.refetch` (a resync, a reconnect, a hand-over between tabs). The scheduler merges the two reads into one.
// - Support's messages are marked seen only while the tab is visible AND the end of the conversation is on screen; typing is
//   sent at most once every 3 s (by the reply form); "Support is typing" lasts 6 s after the last event.
// - A message that arrives scrolls the page to it only when the reader was at the end, else a "New message" button appears.
//   A message the visitor sends always scrolls. Nothing here moves content: the lines and the button reserve or float.
// No state is set from an effect: stream and DOM events call the reducer, and "New message" is worked out while rendering.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
} from "react";
import { ArrowDown } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import type { SupportMessages } from "@/lib/i18n/messages/support";
import { createConnectionStore, type ConnectionStore } from "@/lib/support/connection";
import {
  conversationReducer,
  FALLBACK_REFETCH_MS,
  initialState,
  lastIdFrom,
  nextReadMark,
  receiptOf,
  type ConversationAction,
  type ConversationState,
  type TicketSource,
} from "@/lib/support/conversation";
import { merchantAdapter, tokenAdapter, type TicketAdapter } from "@/lib/support/ticket-api";
import { isAbout, type TicketStatus } from "@/lib/support/ticket-events";
import { openTicketStream } from "@/lib/support/ticket-stream";
import { createRefreshScheduler } from "@/lib/realtime/refresh-scheduler";
import { TicketCsatForm } from "@/components/support/ticket-csat-form";
import { TicketMessages } from "@/components/support/ticket-messages";
import { TicketReplyForm } from "@/components/support/ticket-reply-form";
import { Alert } from "@/components/ui/alert";
import { DescriptionItem } from "@/components/ui/description-list";
import { StatusBadge } from "@/components/ui/status-badge";

/** Who is reading: the customer holds the ticket's token; the merchant is signed in and addresses the ticket by id. */
export type TicketAccess = { kind: "token"; token: string } | { kind: "merchant"; id: number };

type TicketLiveValue = {
  access: TicketAccess;
  adapter: TicketAdapter;
  state: ConversationState;
  dispatch: Dispatch<ConversationAction>;
  connection: ConnectionStore;
};

const TicketLiveContext = createContext<TicketLiveValue | null>(null);

function useTicketLive(): TicketLiveValue {
  const value = useContext(TicketLiveContext);
  if (!value) throw new Error("The ticket parts must sit inside <TicketLive>.");
  return value;
}

const BROWSER_TIMERS = {
  setTimeout: (callback: () => void, ms: number) => window.setTimeout(callback, ms),
  clearTimeout: (handle: unknown) => window.clearTimeout(handle as number),
  now: () => Date.now(),
};

export type TicketLiveProps = {
  /** The ticket's number (`T-1042`): it names the stream's lock and matches a customer's events. */
  number: string;
  access: TicketAccess;
  /** What the server read: the first state. */
  source: TicketSource;
  children: ReactNode;
};

/** Owns the state of one open ticket and keeps it current: stream events, the refetch fallback, the typing timer. */
export function TicketLive({ number, access, source, children }: TicketLiveProps) {
  const token = access.kind === "token" ? access.token : "";
  const merchantId = access.kind === "merchant" ? access.id : 0;
  const adapter = useMemo(() => (merchantId ? merchantAdapter(merchantId) : tokenAdapter(token, number)), [token, merchantId, number]);
  const [state, dispatch] = useReducer(conversationReducer, source, initialState);
  const [connection] = useState(createConnectionStore);

  // The link to the server: the stream, the fallback poll and the reads they ask for.
  useEffect(() => {
    let reading = false;
    let again = false;
    async function reload() {
      if (reading) {
        again = true;
        return;
      }
      reading = true;
      try {
        dispatch({ type: "snapshot", source: await adapter.refetch() });
      } catch {
        // A failed read is silent: the next cause (an event, the 30 s timer, the tab coming back) reads again.
      } finally {
        reading = false;
      }
      if (again) {
        again = false;
        scheduler.request();
      }
    }
    // Reads are collected for 400 ms and are at least 2 s apart, however many causes ask.
    const scheduler = createRefreshScheduler({ timers: BROWSER_TIMERS, run: () => void reload() });

    const handle = openTicketStream(adapter.stream);
    const { client } = handle;
    const about = (ref: { ticketId: number | null; number: string }) => isAbout(ref, { id: adapter.ticketId, number });
    const stops = [
      client.subscribe("ticket.message.created", (data) => {
        if (about(data)) dispatch({ type: "message", message: data.message });
      }),
      client.subscribe("ticket.updated", (data) => {
        if (about(data)) dispatch({ type: "updated", data });
      }),
      client.subscribe("ticket.read", (data) => {
        if (about(data)) dispatch({ type: "read", by: data.by, upToMessageId: data.upToMessageId });
      }),
      client.subscribe("ticket.typing", (data) => {
        if (about(data)) dispatch({ type: "typing", now: Date.now() });
      }),
      // A resync, a reconnect, a hand-over between tabs: events may have been missed, so read the ticket again.
      client.subscribe("stream.refetch", () => scheduler.request()),
      // Every time the stream becomes live, read the ticket: a stream opened without a cursor replays nothing, and the client's
      // own `stream.refetch` skips the first `ready`. So a message written between the server's read and this `ready`, or while
      // the page was hidden (the effects stop and run again when it shows), would stay missing: the 30 s poll is off while live.
      client.onStatus(({ live }) => {
        if (live && connection.get() !== "live") scheduler.request();
        connection.update(live);
      }),
    ];
    const liveAtStart = client.status().live;
    if (liveAtStart) scheduler.request();
    connection.update(liveAtStart);
    client.start();

    // No stream: read the ticket every 30 s while the tab is visible, and at once when it comes back.
    const withoutStream = () => document.visibilityState === "visible" && connection.get() !== "live";
    const timer = window.setInterval(() => {
      if (withoutStream()) scheduler.request();
    }, FALLBACK_REFETCH_MS);
    const onVisibility = () => {
      if (withoutStream()) scheduler.request();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
      for (const stop of stops) stop();
      scheduler.dispose();
      handle.release();
      connection.update(false);
    };
  }, [adapter, number, connection]);

  // "Support is typing" ends by itself: tell the reducer when its time is up.
  const { typingUntil } = state;
  useEffect(() => {
    if (typingUntil === 0) return;
    const timer = window.setTimeout(() => dispatch({ type: "tick", now: Date.now() }), Math.max(0, typingUntil - Date.now()) + 50);
    return () => window.clearTimeout(timer);
  }, [typingUntil]);

  const value = useMemo(() => ({ access, adapter, state, dispatch, connection }), [access, adapter, state, connection]);
  return <TicketLiveContext.Provider value={value}>{children}</TicketLiveContext.Provider>;
}

// ── The page's own facts: status and dates ─────────────────────────────────────────────────────────────────────────

/** The status badge of the page header. `labels` has the four statuses in the page's language. */
export function LiveTicketStatus({ labels }: { labels: Record<TicketStatus, string> }) {
  const { state } = useTicketLive();
  return <StatusBadge kind="ticket" status={state.status} label={labels[state.status]} />;
}

/** The rows of the information list that change with the ticket: last update, resolved (once it is), status. */
export function LiveTicketFacts({
  locale,
  labels,
  statuses,
}: {
  locale: Locale;
  labels: { updated: string; resolved: string; status: string };
  statuses: Record<TicketStatus, string>;
}) {
  const { state } = useTicketLive();
  return (
    <>
      <DescriptionItem label={labels.updated}>{formatDateTime(state.updatedAt, locale)}</DescriptionItem>
      {state.resolvedAt ? <DescriptionItem label={labels.resolved}>{formatDateTime(state.resolvedAt, locale)}</DescriptionItem> : null}
      <DescriptionItem label={labels.status}>
        <StatusBadge kind="ticket" status={state.status} label={statuses[state.status]} />
      </DescriptionItem>
    </>
  );
}

// ── The conversation ───────────────────────────────────────────────────────────────────────────────────────────────

export type TicketConversationTexts = Pick<SupportMessages["ticket"], "conversation" | "you" | "team" | "sentAt" | "reply" | "csat" | "chat">;

function subscribeVisibility(listener: () => void) {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}
const tabIsVisible = () => document.visibilityState === "visible";

/** Brings the end of the conversation into view, only as far as needed; without animation when the reader asked for none. */
function scrollToEnd(element: HTMLElement | null) {
  if (!element) return;
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ block: "nearest", behavior: smooth ? "smooth" : "auto" });
}

const noSubscribe = () => () => undefined;
const canObserve = () => typeof IntersectionObserver !== "undefined";

/** The messages, the typing and connection line, the rating (customers) and the reply form. */
export function TicketConversation({ locale, t }: { locale: Locale; t: TicketConversationTexts }) {
  const { access, adapter, state, dispatch, connection } = useTicketLive();
  const end = useRef<HTMLDivElement>(null);
  const markedUpTo = useRef(0);

  const visible = useSyncExternalStore(subscribeVisibility, tabIsVisible, () => true);
  const observable = useSyncExternalStore(noSubscribe, canObserve, () => true);
  const link = useSyncExternalStore(connection.subscribe, connection.get, () => "idle" as const);

  const lastMessage = state.messages[state.messages.length - 1];
  const lastId = lastMessage ? lastMessage.id : 0;
  const lastSupportId = lastIdFrom(state.messages, "support");

  // Is the end of the conversation on screen? The observer is made again for every new last message, so its first report
  // (`forId`) is about the page AFTER that message was drawn: "seen" waits for it. (Where the browser cannot tell, the end
  // counts as on screen.)
  const [reported, setReported] = useState({ onScreen: false, forId: -1 });
  useEffect(() => {
    const element = end.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const latest = entries[entries.length - 1];
      if (latest) setReported({ onScreen: latest.isIntersecting, forId: lastId });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [lastId]);
  /** The reader is at the end (as of the last report: for a message just drawn this is still the answer from before it). */
  const atEnd = observable ? reported.onScreen : true;
  /** The end is on screen with the newest message in place: the message can count as seen. */
  const endShown = observable ? reported.onScreen && reported.forId === lastId : true;

  // "New message": worked out while rendering (not from an effect). Only support's messages count, and only when the reader
  // is not at the end; it goes away when the end is on screen.
  const [handledId, setHandledId] = useState(lastId);
  const [hasNew, setHasNew] = useState(false);
  if (lastId !== handledId) {
    setHandledId(lastId);
    if (lastId > handledId && lastMessage?.from === "support" && !atEnd) setHasNew(true);
  }
  if (hasNew && atEnd) setHasNew(false);

  // A message arrived: follow it when the reader was at the end (`atEnd` is still the answer from before it was drawn), or when
  // it is the visitor's own (sent here, or from another tab).
  const lastFrom = lastMessage?.from;
  const scrolledFor = useRef(lastId);
  useEffect(() => {
    const arrived = lastId > scrolledFor.current;
    scrolledFor.current = lastId;
    if (arrived && (lastFrom === "you" || atEnd)) scrollToEnd(end.current);
  }, [lastId, lastFrom, atEnd]);

  // Seen: tell the API the visitor has read support's messages, once per newer message, only while the tab is visible and the
  // end of the conversation is on screen.
  useEffect(() => {
    const upTo = nextReadMark({ lastSupportId, seenByYou: state.seenByYou, markedUpTo: markedUpTo.current, visible, onScreen: endShown });
    if (upTo === null) return;
    const before = markedUpTo.current;
    markedUpTo.current = upTo;
    adapter.read(upTo).then(
      () => dispatch({ type: "read", by: "you", upToMessageId: upTo }),
      () => {
        // Not marked: the next change (a message, the tab coming back) tries again.
        if (markedUpTo.current === upTo) markedUpTo.current = before;
      },
    );
  }, [adapter, dispatch, lastSupportId, state.seenByYou, visible, endShown]);

  const hint = state.status === "resolved" ? t.reply.reopens : state.status === "pending" ? t.reply.pendingHint : undefined;
  const typing = state.typingUntil !== 0;

  return (
    <>
      <div>
        <TicketMessages
          messages={state.messages}
          locale={locale}
          t={t}
          fileHref={adapter.fileHref}
          receipt={receiptOf(state)}
        />
        {/* The end of the conversation: what "on screen" and "scroll to the end" mean. */}
        <div ref={end} aria-hidden="true" className="h-px" />
        {/* Zero height: the button floats over the page at the bottom of the viewport and moves nothing. */}
        <div className="sticky bottom-4 z-10 flex h-0 items-end justify-center">
          {hasNew && !atEnd ? (
            <button
              type="button"
              onClick={() => {
                setHasNew(false);
                scrollToEnd(end.current);
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-inverse px-4 text-small font-semibold text-on-inverse shadow-overlay transition-colors hover:bg-inverse-raised"
            >
              <ArrowDown aria-hidden="true" className="size-4" />
              {t.chat.newMessage}
            </button>
          ) : null}
        </div>
        {/* Reserved line, so "typing" and the connection never move what is below. */}
        <div className="mt-2 flex min-h-6 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-small text-ink-subtle">
          <p aria-live="polite">{typing ? t.chat.typing : null}</p>
          <p role="status" className="inline-flex items-center gap-1.5">
            {link === "idle" ? null : (
              <>
                <span aria-hidden="true" className={link === "live" ? "size-2 rounded-full bg-success" : "size-2 rounded-full bg-warning"} />
                {link === "live" ? t.chat.live : t.chat.offline}
              </>
            )}
          </p>
        </div>
      </div>

      {access.kind === "token" && state.canRate ? (
        <div className="rounded-card border border-line bg-surface-muted p-4">
          <TicketCsatForm token={access.token} t={t.csat} onSaved={(score) => dispatch({ type: "rated", csatScore: score })} />
        </div>
      ) : state.csatScore ? (
        <Alert tone="success">{fmt(t.csat.thanks, { score: state.csatScore })}</Alert>
      ) : null}

      <div className="border-t border-line pt-5">
        <TicketReplyForm
          adapter={adapter}
          locale={locale}
          t={t.reply}
          hint={hint}
          onSent={(message) => dispatch({ type: "sent", message })}
        />
      </div>
    </>
  );
}
