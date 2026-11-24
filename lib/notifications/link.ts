// Pure helpers shared by the server and client parts of the notification center (plan D10, D11): which API family
// serves an inbox, how the unread count is written, and where a notification may lead. Safe to import anywhere.
import { FAMILY_ROUTES } from "@/lib/account/routes";
import type { AccountFamily } from "@/lib/account/family";
import { legacyAccountPath } from "@/lib/account/legacy-paths";
import { formatNumber } from "@/lib/format";
import { SITE_PREFIX, sitePath } from "@/lib/site-path";

/**
 * `/…/notifications` of each family: the list is `GET`, `/unread-count` is `GET`, `/:id/read` and `/read-all` are `POST`.
 * A retail account reads the shop family's inbox and a merchant rank the portal family's; the routes come from the one
 * route table (`lib/account/routes.ts`).
 */
export const NOTIFICATION_API: Record<AccountFamily, string> = {
  store: FAMILY_ROUTES.store.notifications,
  client: FAMILY_ROUTES.client.notifications,
};

/** The one notifications page, without the site prefix (`sitePath` adds it). Both families read the inbox here. */
export const NOTIFICATIONS_PAGE = "/account/notifications";

/** The API caps the unread count at 100: the bell shows "99+" for 100. */
export const UNREAD_CAP = 100;

/** "99+" at the cap, else the number formatted. */
export function unreadText(count: number): string {
  return count >= UNREAD_CAP ? `${UNREAD_CAP - 1}+` : formatNumber(count);
}

/** The id of the feed block on the notifications page: after "Mark all as read" the focus moves there. */
export const NOTIFICATION_FEED_ID = "notification-feed";

/** The longest `link` the site follows (BH §4.1 sends short site paths). */
export const MAX_LINK_LENGTH = 200;

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;
/**
 * A leading `/en` or `/ar` that is a whole path segment (`/en`, `/en/x`, `/en?x`, `/en#x`, never `/english`). `/ar` is an
 * old Arabic address that a stored notification may still hold (decision 039): it leads to the same path under `/en`.
 */
const LANGUAGE_PREFIX = /^\/(?:en|ar)(?=$|[/?#])/;
/** `.` and `..`, also percent-encoded: the browser resolves these, so they could leave the page the check looked at. */
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

/**
 * Where a notification's `link` leads, or `null` when the item must render without a link.
 *
 * The API sends a site path without the language (`/account/orders`). Only a root-relative path is accepted: one leading
 * `/`, no `//`, no backslash, no control character, no dot segment, at most 200 characters. A scheme can never pass
 * because every accepted value starts with `/`. Every account has the same pages, so any safe path of the site is
 * accepted for either family. A stored link that still names an old portal page or the old ticket list (`/account/tickets`)
 * is written as the page that replaced it (`legacyAccountPath`, decision 002). The result is `sitePath(link)`; a path that
 * already starts with a language is used as it is, with `/ar` written as `/en` (`/ar/account/orders` →
 * `/en/account/orders`: the old address would only redirect there).
 */
export function notificationHref(link: string | null | undefined): string | null {
  if (typeof link !== "string" || link.length === 0 || link.length > MAX_LINK_LENGTH) return null;
  if (!link.startsWith("/") || link.startsWith("//")) return null;
  if (link.includes("\\") || CONTROL_CHARACTER.test(link)) return null;

  const prefixed = LANGUAGE_PREFIX.test(link);
  // The path as the API meant it, without a language: `/en/account/orders` → `/account/orders`, `/en?x` → `/?x`.
  const rest = prefixed ? link.replace(LANGUAGE_PREFIX, "") : link;
  const bare = rest.startsWith("/") ? rest : `/${rest}`;
  if (bare.startsWith("//")) return null;

  const path = bare.split(/[?#]/, 1)[0] ?? "";
  if (path.split("/").some((segment) => DOT_SEGMENT.test(segment))) return null;

  const current = legacyAccountPath(bare);
  if (current !== null) return sitePath(current);
  return prefixed ? link.replace(LANGUAGE_PREFIX, SITE_PREFIX) : sitePath(link);
}
