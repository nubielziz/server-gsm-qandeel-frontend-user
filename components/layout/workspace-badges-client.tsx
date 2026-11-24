"use client";
// The live badges of the workspace navigation, browser side (owner, 2026-11-15). The server parts that read the first
// values are in workspace-badges.tsx. Each badge is decoration plus words: the mark is aria-hidden and a visually hidden
// suffix (", 3 unread", ", new reply") completes the link's accessible name. No live region here: the header bell
// already announces the unread count, and two regions would say it twice.
// - Notifications: the bell's own store (lib/notifications/unread-store.ts), fed by the live stream the bell mounts, and
//   the bell's pop and rolling number (useBellMotion, count-badge.tsx), so the rail and the bell move together.
// - Support: a dot from lib/support/unread-tickets.ts (live while a ticket page holds the ticket stream, else read
//   again on a client navigation). It pops in when it appears after the first paint, never on a first load.
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { fmt } from "@/lib/i18n/define";
import { cn } from "@/lib/cn";
import type { AccountFamily } from "@/lib/account/family";
import { unreadText } from "@/lib/notifications/link";
import { unreadStore } from "@/lib/notifications/unread-store";
import { unreadTickets } from "@/lib/support/unread-tickets-browser";
import { CountBadge } from "@/components/notifications/count-badge";
import { useBellMotion } from "@/components/notifications/use-bell-motion";
import { NAV_BADGE } from "./nav-badge";

export type NavUnreadBadgeProps = {
  family: AccountFamily;
  /** The unread count the server just read (the same request read as the bell's); null when it could not. */
  initialCount: number | null;
  /** The name suffix with a `{count}` placeholder (", {count} unread"). */
  suffix: string;
};

/** The unread count on the Notifications item: the bell's number, live. Nothing at zero. */
export function NavUnreadBadge({ family, initialCount, suffix }: NavUnreadBadgeProps) {
  const subscribe = useCallback((listener: () => void) => unreadStore.subscribe(family, listener), [family]);
  const polled = useSyncExternalStore(
    subscribe,
    () => unreadStore.getSnapshot(family),
    () => null,
  );
  useEffect(() => {
    // The bell hands over the same count; a second reconcile of an equal count does nothing.
    if (initialCount !== null) unreadStore.reconcile(family, initialCount);
  }, [family, initialCount]);
  const count = polled ?? initialCount ?? 0;
  const text = unreadText(count);
  const { view, onAnimationEnd } = useBellMotion(family, count, text);
  if (count <= 0) return null;
  return (
    <>
      <span className="inline-flex" onAnimationEnd={onAnimationEnd}>
        <CountBadge view={view} text={text} className={cn(NAV_BADGE, "nav-badge-alert")} />
      </span>
      <span className="sr-only">{fmt(suffix, { count: text })}</span>
    </>
  );
}

export type NavSupportDotProps = {
  family: AccountFamily;
  /** The numbers of the tickets with an unseen reply, as the server read them; null when it could not. */
  initial: string[] | null;
  /** The name suffix (", new reply"). */
  label: string;
};

/** The dot on Support while support wrote something the visitor has not seen. */
export function NavSupportDot({ family, initial, label }: NavSupportDotProps) {
  const subscribe = useCallback((listener: () => void) => unreadTickets.subscribe(family, listener), [family]);
  const live = useSyncExternalStore(
    subscribe,
    () => unreadTickets.getSnapshot(family),
    () => null,
  );
  useEffect(() => {
    if (initial !== null) unreadTickets.reconcile(family, initial);
    else void unreadTickets.refresh(family);
  }, [family, initial]);

  // A client navigation reads the list again (the store keeps a floor between reads); the first render does not.
  const pathname = usePathname();
  const seenPath = useRef(pathname);
  useEffect(() => {
    if (seenPath.current === pathname) return;
    seenPath.current = pathname;
    void unreadTickets.refresh(family);
  }, [pathname, family]);

  const on = live ?? (initial !== null && initial.length > 0);
  // Pops in only when it appears after the first paint (React's "storing information from previous renders").
  const [shown, setShown] = useState(on);
  const [popped, setPopped] = useState(false);
  if (on !== shown) {
    setShown(on);
    setPopped(on);
  }
  if (!on) return null;
  return (
    <>
      <span aria-hidden="true" className={cn("nav-dot block size-2.5 rounded-full", popped && "motion-safe:animate-badge-in")} />
      <span className="sr-only">{label}</span>
    </>
  );
}
