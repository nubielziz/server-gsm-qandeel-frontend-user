"use client";
// The notification bell of the workspace header: a link to the notifications page with the unread count on it (plan D10).
// The server passes the first count (`initialCount`, null when it could not read one), so there is no flash; after that
// the shared store (lib/notifications/unread-store.ts) keeps it fresh and every action on the page updates it at once.
// A later server count (router.refresh) never overwrites the store: when it differs, the store asks the API again.
// The accessible name is a polite live region inside the link: it is the link's name and a screen reader hears a change.
// Arrival animation (owner, 2026-11-15; rules in lib/notifications/bell-motion.ts): a live item swings the icon from its
// top, pops the badge and rolls the number; a read rolls it down; reduced motion plays nothing. All of it is decoration:
// the badge is aria-hidden and the live region above says the same as before. While the tab is hidden the title carries
// "(n) " (lib/notifications/title-badge.ts).
import Link from "next/link";
import { Bell as BellIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import type { Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { unreadText, unreadTextInline, type NotificationSurface } from "@/lib/notifications/link";
import { unreadStore } from "@/lib/notifications/unread-store";
import { playRing } from "@/lib/notifications/bell-ring";
import { useBellMotion, useTitleBadge } from "./use-bell-motion";

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
  const { view, onAnimationEnd, settle } = useBellMotion(surface, count, text);
  const iconRef = useRef<SVGSVGElement>(null);
  // The swing is played on the same icon element each time (lib/notifications/bell-ring.ts): never a remount.
  useEffect(() => {
    if (!view.ring || !iconRef.current) return;
    return playRing(iconRef.current, () => settle("bell-ring"));
  }, [view.ring, view.rings, settle]);
  // In an Arabic title "99+" must stay one left-to-right unit, or its "+" lands on the wrong side.
  useTitleBadge(count, locale === "ar" ? unreadTextInline(count, locale) : text);
  return (
    <Link
      href={href}
      onAnimationEnd={onAnimationEnd}
      className={cn(
        "relative inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-line-strong bg-surface text-ink",
        "transition-colors hover:bg-surface-muted",
      )}
    >
      {/* One icon element for good: the swing is played on it (playRing), never by a remount. It pivots on the top centre:
          symmetric, so RTL needs nothing. */}
      <BellIcon ref={iconRef} aria-hidden="true" className="size-5 origin-top" />
      {count > 0 ? (
        <span
          key={view.popKey}
          aria-hidden="true"
          dir="ltr"
          className={cn(
            "num absolute -end-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center overflow-hidden rounded-full bg-danger px-1 text-caption font-bold leading-none text-on-inverse",
            view.pop === "pop" && "motion-safe:animate-badge-pop",
            view.pop === "in" && "motion-safe:animate-badge-in",
          )}
        >
          {/* The leaving number is laid over the badge (absolute), so only the new number sizes it: no width jump. It is
              invisible at rest, so it shows only while its animation runs. */}
          {view.roll ? (
            <span
              key={`out-${view.rollKey}`}
              className={cn(
                "absolute inset-0 flex items-center justify-center opacity-0",
                view.roll.up ? "motion-safe:animate-count-out-up" : "motion-safe:animate-count-out-down",
              )}
            >
              {view.roll.from}
            </span>
          ) : null}
          <span
            key={view.rollKey}
            className={cn(
              "inline-block",
              view.roll && (view.roll.up ? "motion-safe:animate-count-in-up" : "motion-safe:animate-count-in-down"),
            )}
          >
            {text}
          </span>
        </span>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {count > 0 ? fmt(labels.bell, { count: text }) : labels.bellNone}
      </span>
    </Link>
  );
}
