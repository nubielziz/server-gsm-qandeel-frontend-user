"use client";
// The notification bell of the workspace header: a link to the notifications page with the unread count on it (plan D10).
// The server passes the first count (`initialCount`, null when it could not read one), so there is no flash; after that
// the shared store (lib/notifications/unread-store.ts) keeps it fresh and every action on the page updates it at once.
// A later server count (router.refresh) never overwrites the store: when it differs, the store asks the API again.
// The accessible name is a polite live region inside the link: it is the link's name and a screen reader hears a change.
import Link from "next/link";
import { Bell as BellIcon } from "lucide-react";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import type { Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { unreadText, type NotificationSurface } from "@/lib/notifications/link";
import { unreadStore } from "@/lib/notifications/unread-store";

export type BellProps = {
  surface: NotificationSurface;
  locale: Locale;
  /** The notifications page of this area, language-prefixed. */
  href: string;
  /** The unread count the server just read; null when it could not. */
  initialCount: number | null;
  /** `bell` has a `{count}` placeholder ("Notifications, {count} unread"); `bellNone` is the name when nothing is unread. */
  labels: { bell: string; bellNone: string };
};

export function Bell({ surface, locale, href, initialCount, labels }: BellProps) {
  const subscribe = useCallback((listener: () => void) => unreadStore.subscribe(surface, listener), [surface]);
  const polled = useSyncExternalStore(
    subscribe,
    () => unreadStore.getSnapshot(surface),
    () => null,
  );
  useEffect(() => {
    // Not a seed: a streamed server count can be older than a read the store already made (see UnreadStore.reconcile).
    if (initialCount !== null) unreadStore.reconcile(surface, initialCount);
  }, [surface, initialCount]);

  const count = polled ?? initialCount ?? 0;
  const text = unreadText(count, locale);
  return (
    <Link
      href={href}
      className={cn(
        "relative inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-line-strong bg-surface text-ink",
        "transition-colors hover:bg-surface-muted",
      )}
    >
      <BellIcon aria-hidden="true" className="size-5" />
      {count > 0 ? (
        <span
          aria-hidden="true"
          dir="ltr"
          className="num absolute -end-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-caption font-bold leading-none text-on-inverse"
        >
          {text}
        </span>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {count > 0 ? fmt(labels.bell, { count: text }) : labels.bellNone}
      </span>
    </Link>
  );
}
