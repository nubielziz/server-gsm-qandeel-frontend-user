"use client";
// The live notification stream of a workspace (feature 27, plan §5.1). It renders nothing: it opens the family's stream
// (one per browser, shared by the tabs: lib/realtime), feeds the bell's unread store from its events, tells the store
// whether the stream is open (an open stream slows the one-minute poll to five), and shows a toast for a new notification.
// It is mounted by the bell (bell-slot.tsx) and nowhere else, so a stream exists only where a bell does: the workspace header
// of `/account` and, for a signed-in visitor, the shop header (owner, 2026-11-15). A signed-out visitor has no
// bell and no stream. Leaving every page with a bell stops it.
// Toast rules: only `live: true` items (a replayed one is not news), only in a tab the visitor is looking at, not on the
// notifications page (the list shows the item there), at most one toast every 3 s and the rest of the window as one
// "{count} new notifications". The text is plain text (plan D11).
// The bell's animation (lib/notifications/bell-motion.ts) gets its cues here, before each count reaches the store: a
// created item (it rings only when `live`, in a visible tab, at most once every 3 s) and a read (the number rolls down).
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { bellMotion } from "@/lib/notifications/bell-motion";
import type { AccountFamily } from "@/lib/account/family";
import { notificationHref } from "@/lib/notifications/link";
import { unreadStore } from "@/lib/notifications/unread-store";
import { streamFor } from "@/lib/realtime/browser";
import type { NotificationItem } from "@/lib/api/types";
import { createToastBatcher, onNotificationsPage, toastDescription } from "@/lib/realtime/notification-toast";
import { toast } from "@/components/ui/toast";

export type NotificationStreamProps = {
  family: AccountFamily;
  /** The notifications page of this area, language-prefixed: no toast on it, and where a toast without a link leads. */
  href: string;
  /** `view` is the toast's link; `many` has a `{count}` placeholder. */
  labels: { view: string; many: string };
};

const TOAST_MS = 6_000;

export function NotificationStream({ family, href, labels }: NotificationStreamProps) {
  const pathname = usePathname();
  // The handlers below outlive a render: they read the latest props from here instead of restarting the stream.
  const latest = useRef({ pathname, href, labels });
  useEffect(() => {
    latest.current = { pathname, href, labels };
  });

  useEffect(() => {
    const client = streamFor(family);
    const batcher = createToastBatcher<NotificationItem>({
      timers: {
        setTimeout: (callback, ms) => window.setTimeout(callback, ms),
        clearTimeout: (handle) => window.clearTimeout(handle as number),
      },
      showOne(item) {
        const { href: listHref, labels: texts } = latest.current;
        toast({
          title: item.title,
          description: toastDescription(item.body) || undefined,
          tone: "info",
          duration: TOAST_MS,
          action: { label: texts.view, href: notificationHref(item.link) ?? listHref },
        });
      },
      showMany(count) {
        const { href: listHref, labels: texts } = latest.current;
        toast({
          title: fmt(texts.many, { count: formatNumber(count) }),
          tone: "info",
          duration: TOAST_MS,
          action: { label: texts.view, href: listHref },
        });
      },
    });

    const stops = [
      client.subscribe("unread.changed", ({ unread }) => unreadStore.push(family, unread)),
      client.subscribe("notification.read", ({ unread }) => {
        bellMotion.read(family, unread);
        unreadStore.push(family, unread);
      }),
      client.subscribe("notification.created", ({ item, unread, live }) => {
        bellMotion.arrival(family, unread, live);
        unreadStore.push(family, unread);
        const { pathname: here, href: listHref } = latest.current;
        if (live && document.visibilityState === "visible" && !onNotificationsPage(here, listHref)) batcher.push(item);
      }),
      client.onStatus(({ live }) => unreadStore.setLive(family, live)),
    ];
    unreadStore.setLive(family, client.status().live);
    client.start();

    return () => {
      for (const stop of stops) stop();
      batcher.dispose();
      client.stop();
      unreadStore.setLive(family, false);
    };
  }, [family]);

  return null;
}
