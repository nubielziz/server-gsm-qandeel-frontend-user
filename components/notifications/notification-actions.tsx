"use client";
// The buttons of the notifications page: "Open" and "Mark as read" on one item, and "Mark all as read" for the page.
// Every action goes through the browser client (CSRF token of the area's surface), then refreshes the list
// (`router.refresh()`) and the bell (`unreadStore.refresh`), telling the bell first that its next lower count is a read
// (the number rolls down, lib/notifications/bell-motion.ts). A 404 on mark-read means the item is gone: the refreshed
// list shows what is left. A signed-out answer refreshes the route (the layout then asks to sign in); every other
// failure, such as 403 CSRF_FAILED, is shown and never signs anyone out.
import { ArrowRight, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { api, forgetCsrf } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { pathOf } from "@/lib/api/query";
import { formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import { isSignedOutError } from "@/lib/merchant/signed-out";
import { bellMotion } from "@/lib/notifications/bell-motion";
import { NOTIFICATION_API, NOTIFICATION_FEED_ID, type NotificationSurface } from "@/lib/notifications/link";
import { unreadStore } from "@/lib/notifications/unread-store";
import { Button, ButtonLink } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

type ReadAllResult = { updated: number };

/** Shared by both buttons: what to do with a failed call. Returns true when the caller should carry on with a refresh. */
function useFailureHandler(surface: NotificationSurface) {
  const router = useRouter();
  const errorText = useErrorText();
  return (error: unknown): boolean => {
    if (isSignedOutError(error)) {
      forgetCsrf(surface === "merchant" ? "client" : "store");
      router.refresh();
      return false;
    }
    if (isApiError(error) && error.status === 404) return true;
    toast.error(errorText.message(error), errorText.reference(error));
    return false;
  };
}

export type NotificationActionsProps = {
  id: number;
  surface: NotificationSurface;
  unread: boolean;
  /** Where the item leads (`notificationHref`), or null for an item without a link. */
  href: string | null;
  /** True on the Unread tab: a read item leaves the list, so the focus goes to the feed instead of the row. */
  leavesList: boolean;
  /** The id of the element that holds the item's title: it describes the "Open" link ("Open", then the title). */
  titleId: string;
  labels: { open: string; markRead: string; markedRead: string };
};

/** "Open" (which also marks the item read, not awaited) and "Mark as read" for one item. */
export function NotificationActions({ id, surface, unread, href, leavesList, titleId, labels }: NotificationActionsProps) {
  const router = useRouter();
  const fail = useFailureHandler(surface);
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const button = useRef<HTMLButtonElement>(null);
  const readPath = pathOf(`${NOTIFICATION_API[surface]}/:id/read`, { id });

  async function markRead() {
    if (busy) return;
    setBusy(true);
    // The button disappears once the item is read: keep the focus in the row, or in the feed when the row goes too.
    const row = button.current?.closest("li") ?? null;
    try {
      await api.post(readPath);
      toast.success(labels.markedRead);
    } catch (error) {
      if (!fail(error)) {
        setBusy(false);
        return;
      }
    }
    bellMotion.read(surface, null);
    void unreadStore.refresh(surface);
    startRefresh(() => router.refresh());
    (leavesList ? document.getElementById(NOTIFICATION_FEED_ID) : row)?.focus({ preventScroll: true });
    setBusy(false);
  }

  function onOpen() {
    if (!unread) return;
    // Following the link also reads the item. Not awaited: a failure changes nothing for the visitor.
    api.post(readPath).then(
      () => {
        bellMotion.read(surface, null);
        return unreadStore.refresh(surface);
      },
      () => undefined,
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {href ? (
        <ButtonLink
          href={href}
          variant="secondary"
          size="sm"
          onClick={onOpen}
          aria-describedby={titleId}
          endIcon={<ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />}
        >
          {labels.open}
        </ButtonLink>
      ) : null}
      {unread ? (
        <Button ref={button} variant="ghost" size="sm" onClick={markRead} loading={busy || refreshing} aria-describedby={titleId}>
          {labels.markRead}
        </Button>
      ) : null}
    </div>
  );
}

export type MarkAllReadProps = {
  surface: NotificationSurface;
  locale: Locale;
  /** The newest id on screen: an item that arrived after the page was drawn stays unread. */
  upToId: number;
  labels: { markAllRead: string; markedAll: string; markedNone: string };
};

/** "Mark all as read": everything up to the newest item the visitor can see. */
export function MarkAllRead({ surface, locale, upToId, labels }: MarkAllReadProps) {
  const router = useRouter();
  const fail = useFailureHandler(surface);
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  async function markAll() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.post<ReadAllResult | undefined>(`${NOTIFICATION_API[surface]}/read-all`, { upToId });
      toast.success(result?.updated ? fmt(labels.markedAll, { count: formatNumber(result.updated, locale) }) : labels.markedNone);
    } catch (error) {
      if (!fail(error)) {
        setBusy(false);
        return;
      }
    }
    bellMotion.read(surface, null);
    void unreadStore.refresh(surface);
    startRefresh(() => router.refresh());
    // The button goes away once nothing is unread: move the focus to the feed.
    document.getElementById(NOTIFICATION_FEED_ID)?.focus({ preventScroll: true });
    setBusy(false);
  }

  return (
    <Button variant="secondary" size="sm" onClick={markAll} loading={busy || refreshing} startIcon={<CheckCheck aria-hidden="true" />}>
      {labels.markAllRead}
    </Button>
  );
}
