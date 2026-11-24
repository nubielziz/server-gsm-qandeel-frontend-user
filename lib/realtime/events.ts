// The notification stream's names and data (feature 27; the contract is backend docs/contract/realtime-events.md, plan §3.5).
// Hand-written on purpose: the OpenAPI describes the three stream routes but not the frames. Safe to import anywhere.
import type { NotificationItem } from "@/lib/api/types";
import type { AccountFamily } from "@/lib/account/family";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { NOTIFICATION_API } from "@/lib/notifications/link";
import { isRecord, parseBaseFrame, parseJson, type BaseEvents } from "./stream-client";

/** The stream route of each family (same origin; Next rewrites `/client/*` and `/store/v1/*` to the API). */
export const STREAM_API: Record<AccountFamily, string> = {
  store: FAMILY_ROUTES.store.stream,
  client: FAMILY_ROUTES.client.stream,
};

/** The route the client asks after a refused stream: the family's own unread count (401/403 end it, 429 slows it). */
export const STREAM_PROBE_API: Record<AccountFamily, string> = {
  store: `${NOTIFICATION_API.store}/unread-count`,
  client: `${NOTIFICATION_API.client}/unread-count`,
};

/** The name of the lock and of the broadcast channel of a family: one stream per browser and family. */
export function streamLockName(family: AccountFamily): string {
  return `gsm-stream-${family}`;
}

/** The events a notification stream sends besides the base ones (`ready`, `hb`, `resync`, `bye`). */
export const NOTIFICATION_EVENT_NAMES = ["notification.created", "notification.read", "unread.changed"] as const;

export type NotificationCreated = {
  /** The list's own item shape. */
  item: NotificationItem;
  /** The unread count after this item (capped at 100). */
  unread: number;
  /** False for an item a reconnect replayed: it is not news, so it makes no toast. */
  live: boolean;
};

export type NotificationRead = {
  ids: number[];
  /** True when the viewer marked everything read. */
  all: boolean;
  upToId: number | null;
  unread: number;
};

export type NotificationEvents = BaseEvents & {
  "notification.created": NotificationCreated;
  "notification.read": NotificationRead;
  "unread.changed": { unread: number };
};

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * True for the fields the page reads; the rest of the item is passed through as the API sent it. The item carries no
 * language (decision 039): a frame is never dropped for a missing or unknown `locale`, which an API from before the
 * change still sends and the page ignores.
 */
function isItem(value: unknown): value is NotificationItem {
  return (
    isRecord(value) &&
    isId(value.id) &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    (value.link === null || typeof value.link === "string")
  );
}

/**
 * The data of a frame of a notification stream, checked, or `undefined` for a frame to drop (not JSON, a shape the
 * page does not understand, or an event this version does not know). Base events go through `parseBaseFrame`.
 */
export function parseFrame(event: string, raw: string): unknown {
  switch (event) {
    case "notification.created": {
      const value = parseJson(raw);
      if (!isRecord(value) || !isItem(value.item) || !isCount(value.unread)) return undefined;
      return { item: value.item, unread: value.unread, live: value.live === true } satisfies NotificationCreated;
    }
    case "notification.read": {
      const value = parseJson(raw);
      if (!isRecord(value) || !isCount(value.unread) || !Array.isArray(value.ids)) return undefined;
      return {
        ids: value.ids.filter(isId),
        all: value.all === true,
        upToId: isId(value.upToId) ? value.upToId : null,
        unread: value.unread,
      } satisfies NotificationRead;
    }
    case "unread.changed": {
      const value = parseJson(raw);
      if (!isRecord(value) || !isCount(value.unread)) return undefined;
      return { unread: value.unread };
    }
    case "ready":
    case "hb":
    case "resync":
    case "bye":
      return parseBaseFrame(event, raw);
    default:
      return undefined;
  }
}

/**
 * The duplicate check of the stream: an item is handled once, whichever tab or replay brings it again. Only
 * `notification.created` can repeat; the counts are state, so repeating them is harmless.
 */
export function dedupeKeyOf(event: string, data: unknown): string | null {
  if (event !== "notification.created" || !isRecord(data) || !isRecord(data.item)) return null;
  return `item:${String(data.item.id)}`;
}
