// Pure helpers shared by the server and client parts of the notification center (plan D10, D11): which API surface
// serves an area, how the unread count is written, and where a notification may lead. Safe to import anywhere.
import { formatNumber } from "@/lib/format";
import { localePath, type Locale } from "@/lib/i18n/config";

/** The two areas that have a notification center. They are separate sessions on separate API surfaces. */
export type NotificationSurface = "customer" | "merchant";

/** `/…/notifications` of each surface: the list is `GET`, `/unread-count` is `GET`, `/:id/read` and `/read-all` are `POST`. */
export const NOTIFICATION_API: Record<NotificationSurface, string> = {
  customer: "/store/v1/me/notifications",
  merchant: "/client/notifications",
};

/** The notifications page of each area, without the language prefix (`localePath` adds it). */
export const NOTIFICATIONS_PAGE: Record<NotificationSurface, string> = {
  customer: "/account/notifications",
  merchant: "/merchant/notifications",
};

/** The API caps the unread count at 100: the bell shows "99+" for 100. */
export const UNREAD_CAP = 100;

/** "99+" at the cap, else the number in the page's language. */
export function unreadText(count: number, locale: Locale): string {
  return count >= UNREAD_CAP ? `${UNREAD_CAP - 1}+` : formatNumber(count, locale);
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
/** `.` and `..`, also percent-encoded: the browser resolves these, so they could leave the area the check looked at. */
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

/**
 * Where a notification's `link` leads, or `null` when the item must render without a link.
 *
 * The API sends a site path without the language (`/account/orders`). Only a root-relative path is accepted: one leading
 * `/`, no `//`, no backslash, no control character, no dot segment, at most 200 characters. A scheme can never pass
 * because every accepted value starts with `/`. In the merchant area the path must be `/merchant` or below it. The result
 * is `localePath(locale, link)`; a path that already starts with a language is used as it is, with `/ar` written as the
 * page's language (`/ar/account/orders` → `/en/account/orders`: the old address would only redirect there).
 */
export function notificationHref(link: string | null | undefined, locale: Locale, area: NotificationSurface): string | null {
  if (typeof link !== "string" || link.length === 0 || link.length > MAX_LINK_LENGTH) return null;
  if (!link.startsWith("/") || link.startsWith("//")) return null;
  if (link.includes("\\") || CONTROL_CHARACTER.test(link)) return null;

  const prefixed = LANGUAGE_PREFIX.test(link);
  // The path as the API meant it, without a language: `/en/merchant/orders` → `/merchant/orders`, `/en?x` → `/?x`.
  const rest = prefixed ? link.replace(LANGUAGE_PREFIX, "") : link;
  const bare = rest.startsWith("/") ? rest : `/${rest}`;
  if (bare.startsWith("//")) return null;

  const path = bare.split(/[?#]/, 1)[0] ?? "";
  if (path.split("/").some((segment) => DOT_SEGMENT.test(segment))) return null;
  if (area === "merchant" && path !== "/merchant" && !path.startsWith("/merchant/")) return null;

  return prefixed ? link.replace(LANGUAGE_PREFIX, `/${locale}`) : localePath(locale, link);
}
