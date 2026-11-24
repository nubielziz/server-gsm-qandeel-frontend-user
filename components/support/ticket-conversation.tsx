"use client";
// The live ticket conversation (feature 28; backend plan `docs/briefs/28-support-live-chat.md` §2 and §4.2). One file, four
// parts, because they share one state:
// - `TicketLive`: the provider. It owns the state (`lib/support/conversation.ts`), the adapter (the customer's token or
//   the merchant's id), the stream and the refetch. It renders no markup of its own, so a server page can wrap its whole body
//   in it and keep the static parts as Server Components.
// - `TicketConversation`: the card body: the messages, the connection line and the reply form.
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
// - Support's messages are marked seen only while the tab is visible AND the end of the conversation is on screen.
// - A message that arrives scrolls the page to it only when the reader was at the end, else a "New message" button appears.
//   A message the visitor sends always scrolls. Nothing here moves content: the lines and the button reserve or float.
// - A resolved ticket is closed to the visitor (owner, 2026-11-15; lib/support/reply-area.ts): no reply box, no attach
//   control, but a calm "This ticket is closed" notice (a polite live region) with the way to a new ticket.
//   It follows the status live: a `ticket.updated` that resolves the ticket swaps the box for the notice (a draft is
//   discarded, and the notice says so), a reopen brings the box back. A send that meets a ticket closed a moment ago
//   (`409 TICKET_RESOLVED`) shows the notice with the visitor's text in it, and asks for a fresh read of the ticket.
// No state is set from an effect: stream and DOM events call the reducer, and "New message" is worked out while rendering.
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
} from "react";
import { ArrowDown, Lock } from "lucide-react";
import { formatDateTime } from "@/lib/format";
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
import { initialReplyArea, refusedAsClosed, replyAreaFor, unsentText } from "@/lib/support/reply-area";
import { merchantAdapter, tokenAdapter, type TicketAdapter } from "@/lib/support/ticket-api";
import { isAbout, type TicketStatus } from "@/lib/support/ticket-events";
import { openTicketStream } from "@/lib/support/ticket-stream";
import { createRefreshScheduler } from "@/lib/realtime/refresh-scheduler";
import { TicketMessages } from "@/components/support/ticket-messages";
import { TicketReplyForm } from "@/components/support/ticket-reply-form";
import { ButtonLink } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { DescriptionItem } from "@/components/ui/description-list";
import { StatusBadge } from "@/components/ui/status-badge";

/** Who is reading: the customer holds the ticket's token; the merchant is signed in and addresses the ticket by id. */
export type TicketAccess = { kind: "token"; token: string } | { kind: "merchant"; id: number };

type TicketLiveValue = {
  adapter: TicketAdapter;
  state: ConversationState;
  dispatch: Dispatch<ConversationAction>;
  connection: ConnectionStore;
  /** Asks for a fresh read of the ticket (merged with the other causes by the scheduler). */
  refresh(): void;
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

/** Owns the state of one open ticket and keeps it current: stream events and the refetch fallback. */
export function TicketLive({ number, access, source, children }: TicketLiveProps) {
  const token = access.kind === "token" ? access.token : "";
  const merchantId = access.kind === "merchant" ? access.id : 0;
  const adapter = useMemo(() => (merchantId ? merchantAdapter(merchantId) : tokenAdapter(token, number)), [token, merchantId, number]);
  const [state, dispatch] = useReducer(conversationReducer, source, initialState);
  const [connection] = useState(createConnectionStore);
  // The scheduler lives in the effect below; event handlers reach it through this (a no-op while it is not running).
  const requestRead = useRef<() => void>(() => undefined);

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
    requestRead.current = () => scheduler.request();

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
      requestRead.current = () => undefined;
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
      for (const stop of stops) stop();
      scheduler.dispose();
      handle.release();
      connection.update(false);
    };
  }, [adapter, number, connection]);

  const value = useMemo(
    () => ({ adapter, state, dispatch, connection, refresh: () => requestRead.current() }),
    [adapter, state, connection],
  );
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
  labels,
  statuses,
}: {
  labels: { updated: string; resolved: string; status: string };
  statuses: Record<TicketStatus, string>;
}) {
  const { state } = useTicketLive();
  return (
    <>
      <DescriptionItem label={labels.updated}>{formatDateTime(state.updatedAt)}</DescriptionItem>
      {state.resolvedAt ? <DescriptionItem label={labels.resolved}>{formatDateTime(state.resolvedAt)}</DescriptionItem> : null}
      <DescriptionItem label={labels.status}>
        <StatusBadge kind="ticket" status={state.status} label={statuses[state.status]} />
      </DescriptionItem>
    </>
  );
}

// ── The conversation ───────────────────────────────────────────────────────────────────────────────────────────────

export type TicketConversationTexts = Pick<
  SupportMessages["ticket"],
  "conversation" | "you" | "team" | "sentAt" | "reply" | "chat" | "closed"
>;

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

export type TicketConversationProps = {
  t: TicketConversationTexts;
  /** "Open a new ticket" of the closed notice: the new-ticket form of the surface (lib/support/new-ticket-link.ts). */
  newTicketHref: string;
};

/** The messages, the connection line and the reply form, or the closed notice. */
export function TicketConversation({ t, newTicketHref }: TicketConversationProps) {
  const { adapter, state, dispatch, connection, refresh } = useTicketLive();
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

  // The reply box or the closed notice: worked out while rendering from the live status (not from an effect). `drafting` is
  // told by the box on every change the visitor makes.
  const [drafting, setDrafting] = useState(false);
  const [area, setArea] = useState(() => initialReplyArea(state.status));
  const nextArea = replyAreaFor(area, state.status, drafting);
  if (nextArea !== area) {
    setArea(nextArea);
    setDrafting(nextArea.closed ? false : nextArea.restore.trim() !== "");
  }
  const closed = nextArea.closed;
  /** The API refused a message or a file as closed: the notice keeps the text, the ticket is read again for its dates. */
  function onRefusedClosed(text: string) {
    setArea((current) => (current.closed ? current : refusedAsClosed(current, text)));
    dispatch({ type: "closed" });
    refresh();
  }

  const hint = state.status === "pending" ? t.reply.pendingHint : undefined;

  return (
    <>
      <div>
        <TicketMessages
          messages={state.messages}
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
        {/* Reserved line, so the connection never moves what is below. */}
        <div className="mt-2 flex min-h-6 flex-wrap items-center justify-end gap-x-4 gap-y-1 text-small text-ink-subtle">
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

      <div className="border-t border-line pt-5">
        {/* Always there, so the notice is announced when it appears. */}
        <div aria-live="polite">
          {closed ? (
            <TicketClosedNotice
              t={t.closed}
              href={newTicketHref}
              discarded={nextArea.discarded}
              unsent={unsentText(nextArea)}
              takeFocus={nextArea.live}
            />
          ) : null}
        </div>
        {closed ? null : (
          <TicketReplyForm
            adapter={adapter}
            t={t.reply}
            hint={hint}
            initialBody={nextArea.restore}
            onSent={(message) => dispatch({ type: "sent", message })}
            onDraft={setDrafting}
            onClosed={onRefusedClosed}
          />
        )}
      </div>
    </>
  );
}

/**
 * "This ticket is closed": what a closed ticket shows instead of the reply box, with the way to a new ticket. `discarded`
 * says the visitor's draft was thrown away; `unsent` is the text of a send refused as closed, shown read-only to copy.
 * `takeFocus`: it replaced the box while the page was open, so it takes the focus the box had (never on page load).
 */
function TicketClosedNotice({
  t,
  href,
  discarded,
  unsent,
  takeFocus,
}: {
  t: TicketConversationTexts["closed"];
  href: string;
  discarded: boolean;
  unsent: string | null;
  takeFocus: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    // The box (and the focus in it) just went away: keep a keyboard or screen reader user here instead of at the page top.
    if (!takeFocus) return;
    const active = document.activeElement;
    if (!active || active === document.body) box.current?.focus({ preventScroll: true });
  }, [takeFocus]);

  return (
    <div
      ref={box}
      tabIndex={-1}
      role="group"
      aria-labelledby={titleId}
      className="flex items-start gap-3 rounded-card border border-line bg-surface-muted px-4 py-4"
    >
      <span className="mt-0.5 shrink-0 text-ink-muted [&_svg]:size-5">
        <Lock aria-hidden="true" />
      </span>
      <div className="grid min-w-0 flex-1 gap-3">
        <div>
          <h3 id={titleId} className="text-body font-semibold text-ink">
            {t.title}
          </h3>
          <p className="mt-0.5 text-body text-ink-muted">{t.text}</p>
          {discarded ? <p className="mt-1 text-small text-ink-subtle">{t.discarded}</p> : null}
        </div>
        {unsent !== null ? (
          <Textarea
            name="unsent"
            label={t.unsentLabel}
            hint={t.unsentHint}
            readOnly
            rows={Math.min(6, Math.max(2, unsent.split("\n").length))}
            value={unsent}
          />
        ) : null}
        <div>
          <ButtonLink href={href} variant="secondary" size="sm">
            {t.newTicket}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
