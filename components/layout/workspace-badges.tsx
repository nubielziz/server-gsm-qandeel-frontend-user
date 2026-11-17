// The live badges of the workspace navigation, server side (owner, 2026-11-15): the unread notifications, the support
// dot and the orders in progress on the rail, the drawer and the phone tab bar. A layout puts one in a nav item's
// `badge`. Each reads its first value with the visitor's session, uncached and once per request (React `cache`), inside
// its own <Suspense> with an empty fallback: nothing in the shell waits for it, and the badge lies over the icon's corner
// (or at the drawer row's end), so it never moves anything when it streams in. A failed read shows no badge.
// The browser parts (live updates) are in workspace-badges-client.tsx.
import { cache, Suspense } from "react";
import { apiSessionList } from "@/lib/api/server";
import { listQuery } from "@/lib/api/query";
import { formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { portal } from "@/lib/i18n/messages/portal";
import { UNREAD_CAP, type NotificationSurface } from "@/lib/notifications/link";
import { TICKET_LIST_API, UNREAD_SCAN, unreadNumbers } from "@/lib/support/unread-tickets";
import { readUnreadCount } from "@/components/notifications/bell-slot";
import { NAV_BADGE } from "./nav-badge";
import { NavSupportDot, NavUnreadBadge } from "./workspace-badges-client";

/** The order list of each surface. */
const ORDERS_API: Record<NotificationSurface, string> = {
  customer: "/store/v1/me/orders",
  merchant: "/client/orders",
};

/** The statuses that count as "in progress": accepted and not finished yet. */
export const IN_PROGRESS = ["pending", "processing"] as const;

/**
 * How many orders of the visitor are in progress (`x-total-count` of a one-row read), or null when it cannot be read (a
 * merchant waiting for approval gets 403). Once per request; no-store (lib/api/server.ts).
 */
export const readOrdersInProgress = cache(async (surface: NotificationSurface): Promise<number | null> => {
  try {
    const { total } = await apiSessionList(ORDERS_API[surface], { query: listQuery({ start: 0, end: 1 }, { status: [...IN_PROGRESS] }) });
    return Number.isFinite(total) && total > 0 ? Math.trunc(total) : 0;
  } catch {
    return null;
  }
});

/**
 * The numbers of the visitor's tickets with a reply from support they have not seen, among the 50 most recently active
 * (a reply makes a ticket the most recent one), or null when the list cannot be read. Once per request; no-store.
 */
export const readUnreadTickets = cache(async (surface: NotificationSurface): Promise<string[] | null> => {
  try {
    const { data } = await apiSessionList<{ number: string; hasUnread: boolean }>(TICKET_LIST_API[surface], {
      query: listQuery({ start: 0, end: UNREAD_SCAN }),
    });
    return unreadNumbers(data);
  } catch {
    return null;
  }
});

/** "99+" at the cap, else the number formatted (the same rule as the bell's). */
function countText(count: number): string {
  return count >= UNREAD_CAP ? `${UNREAD_CAP - 1}+` : formatNumber(count);
}

async function NotificationsBadgeRead({ surface }: { surface: NotificationSurface }) {
  const count = await readUnreadCount(surface);
  const t = portal;
  return <NavUnreadBadge surface={surface} initialCount={count} suffix={t.navBadges.unread} />;
}

/** The unread count on the Notifications item: live through the bell's store. */
export function NotificationsNavBadge({ surface }: { surface: NotificationSurface }) {
  return (
    <Suspense fallback={null}>
      <NotificationsBadgeRead surface={surface} />
    </Suspense>
  );
}

async function SupportDotRead({ surface }: { surface: NotificationSurface }) {
  const initial = await readUnreadTickets(surface);
  const t = portal;
  return <NavSupportDot surface={surface} initial={initial} label={t.navBadges.newReply} />;
}

/** The dot on Support / My tickets: live while a ticket page holds the ticket stream, else read again on navigation. */
export function SupportNavBadge({ surface }: { surface: NotificationSurface }) {
  return (
    <Suspense fallback={null}>
      <SupportDotRead surface={surface} />
    </Suspense>
  );
}

async function OrdersBadgeRead({ surface }: { surface: NotificationSurface }) {
  const count = await readOrdersInProgress(surface);
  const t = portal;
  if (!count) return null;
  const text = countText(count);
  return (
    <>
      <span aria-hidden="true" dir="ltr" className={`${NAV_BADGE} nav-badge-count num`}>
        {text}
      </span>
      <span className="sr-only">{fmt(t.navBadges.inProgress, { count: text })}</span>
    </>
  );
}

/** The number of orders in progress on the Orders item: read with the page, no live update. */
export function OrdersNavBadge({ surface }: { surface: NotificationSurface }) {
  return (
    <Suspense fallback={null}>
      <OrdersBadgeRead surface={surface} />
    </Suspense>
  );
}
