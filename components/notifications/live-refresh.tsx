"use client";
// Keeps the notifications page current without a reload (feature 27, plan §5.1). Rendered by notification-list.tsx; it
// listens to the family's stream (started by the bell) and:
// - on page 1: a new item, a resync or a reconnect makes the server list render again in place (`router.refresh()`; the
//   scroll position is kept). Events are collected for 400 ms and refreshes are at least 2 s apart. An item read in another
//   tab or on another device refreshes the list too, when it is still shown as unread here;
// - on any other page: a new item would shift the pages under the reader, so the list stays and a floating "New
//   notifications" pill links to page 1 (an `aria-live` region, fixed in the viewport: it moves no content).
// The pill is not raised by a read event (nothing is new). The component is keyed by page and tab in the list, so what it
// remembers (the pill) ends when the visitor moves.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AccountFamily } from "@/lib/account/family";
import { streamFor } from "@/lib/realtime/browser";
import { createRefreshScheduler, needsRefresh, type RefreshWish } from "@/lib/realtime/refresh-scheduler";

export type LiveRefreshProps = {
  family: AccountFamily;
  page: number;
  /** Page 1 of the same tab (all or unread), language-prefixed. */
  pageOneHref: string;
  /** Ids of the items on screen that are still unread: a read event only matters for one of them. */
  unreadIds: number[];
  labels: { pill: string; pillAction: string };
};

export function LiveRefresh({ family, page, pageOneHref, unreadIds, labels }: LiveRefreshProps) {
  const router = useRouter();
  const [fresh, setFresh] = useState(false);
  const latest = useRef({ page, unreadIds });
  useEffect(() => {
    latest.current = { page, unreadIds };
  });

  useEffect(() => {
    const client = streamFor(family);
    const wish: RefreshWish = { always: false, all: false, readIds: new Set() };
    const scheduler = createRefreshScheduler({
      timers: {
        setTimeout: (callback, ms) => window.setTimeout(callback, ms),
        clearTimeout: (handle) => window.clearTimeout(handle as number),
        now: () => Date.now(),
      },
      run() {
        const wanted = needsRefresh(wish, new Set(latest.current.unreadIds));
        wish.always = false;
        wish.all = false;
        wish.readIds.clear();
        if (wanted) router.refresh();
      },
    });

    /** Something new may exist: draw page 1 again, or tell the reader of another page. */
    function news() {
      if (latest.current.page === 1) {
        wish.always = true;
        scheduler.request();
      } else {
        setFresh(true);
      }
    }

    const stops = [
      client.subscribe("notification.created", news),
      client.subscribe("stream.refetch", news),
      client.subscribe("notification.read", ({ ids, all }) => {
        if (latest.current.page !== 1) return;
        if (all) wish.all = true;
        for (const id of ids) wish.readIds.add(id);
        scheduler.request();
      }),
    ];
    return () => {
      for (const stop of stops) stop();
      scheduler.dispose();
    };
  }, [family, router]);

  if (page === 1) return null;
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 top-24 z-40 flex justify-center">
      {fresh ? (
        <Link
          href={pageOneHref}
          onClick={() => setFresh(false)}
          className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-inverse px-4 text-small font-semibold text-on-inverse shadow-overlay transition-colors hover:bg-inverse-raised"
        >
          <span>{labels.pill}</span>
          <span className="font-bold underline underline-offset-4">{labels.pillAction}</span>
        </Link>
      ) : null}
    </div>
  );
}
