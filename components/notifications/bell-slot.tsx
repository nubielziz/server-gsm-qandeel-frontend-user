// The bell of a workspace header, server side: reads the first unread count with the visitor's session so the bell has
// its number in the first paint (plan D10). It reads cookies, so the layout renders it inside <Suspense> with
// <BellSkeleton /> (the same 44 px square). A failed read is not an error for the page: the bell then starts without a
// number and the browser store asks again at once. It also mounts the live stream (notification-stream.tsx, renders
// nothing): a stream is opened only where a bell is, never on a public page.
import { cache } from "react";
import { apiSessionGet } from "@/lib/api/server";
import type { UnreadCount } from "@/lib/api/types";
import { localePath } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { notifications } from "@/lib/i18n/messages/notifications";
import { NOTIFICATION_API, NOTIFICATIONS_PAGE, type NotificationSurface } from "@/lib/notifications/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell } from "./bell";
import { NotificationStream } from "./notification-stream";

/**
 * The unread count of a surface for this request (0 or more, the API caps it at 100), or null when it cannot be read.
 * Deduplicated per request: the layout's bell and the notifications page ask once together.
 */
export const readUnreadCount = cache(async (surface: NotificationSurface): Promise<number | null> => {
  try {
    const answer = await apiSessionGet<UnreadCount>(`${NOTIFICATION_API[surface]}/unread-count`);
    const unread = answer?.unread;
    return typeof unread === "number" && Number.isFinite(unread) ? Math.max(0, Math.trunc(unread)) : null;
  } catch {
    return null;
  }
});

export function BellSkeleton() {
  return <Skeleton className="size-11 shrink-0 rounded-control" />;
}

export async function BellSlot({ surface }: { surface: NotificationSurface }) {
  const [locale, t, initialCount] = await Promise.all([getLocale(), getMessages(notifications), readUnreadCount(surface)]);
  const href = localePath(locale, NOTIFICATIONS_PAGE[surface]);
  return (
    <>
      <Bell surface={surface} locale={locale} href={href} initialCount={initialCount} labels={{ bell: t.bell, bellNone: t.bellNone }} />
      <NotificationStream surface={surface} locale={locale} href={href} labels={{ view: t.live.view, many: t.live.many }} />
    </>
  );
}
