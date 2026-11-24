"use client";
// Keeps a ticket list current without a reload (feature 28, plan §4.2), like the notifications list does (feature 27): the
// ticket events of the signed-in family's stream (a new message, a status change, a new ticket, a read on another device)
// make the server list render again in place with `router.refresh()`. Events are collected for 400 ms and refreshes are at
// least 2 s apart. It renders nothing. The stream is the one the ticket chat shares (`lib/support/ticket-stream.ts`): the
// last ticket page of the browser to leave it closes it. Without a stream the list stays as it was drawn.
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { AccountFamily } from "@/lib/account/family";
import { createRefreshScheduler } from "@/lib/realtime/refresh-scheduler";
import { acquireFamilyTicketStream } from "@/lib/support/ticket-stream";

export function TicketsLiveRefresh({ family }: { family: AccountFamily }) {
  const router = useRouter();
  useEffect(() => {
    const handle = acquireFamilyTicketStream(family);
    const { client } = handle;
    const scheduler = createRefreshScheduler({
      timers: {
        setTimeout: (callback, ms) => window.setTimeout(callback, ms),
        clearTimeout: (timer) => window.clearTimeout(timer as number),
        now: () => Date.now(),
      },
      run: () => router.refresh(),
    });
    const stops = [
      client.subscribe("ticket.message.created", () => scheduler.request()),
      client.subscribe("ticket.updated", () => scheduler.request()),
      // The visitor's own read on another device changes the unread dot; support's read changes nothing in the list.
      client.subscribe("ticket.read", (data) => {
        if (data.by === "you") scheduler.request();
      }),
      client.subscribe("stream.refetch", () => scheduler.request()),
    ];
    client.start();
    return () => {
      for (const stop of stops) stop();
      scheduler.dispose();
      handle.release();
    };
  }, [family, router]);
  return null;
}
