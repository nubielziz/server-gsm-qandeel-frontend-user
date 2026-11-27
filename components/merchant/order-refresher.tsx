"use client";
// Keeps an open order's page fresh (shop decision 010): draws nothing, and while it is mounted asks the router to draw the
// server page again every 30 seconds (tab visible, no modal open, no request running) as long as the order is not final, and
// once when the cancel window ends. The rules are in lib/merchant/order-refresh.ts.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isOpenOrder, watchOrder } from "@/lib/merchant/order-refresh";

/**
 * @param status the order's status: a completed or rejected order is not polled
 * @param cancelUntil the end of the cancel window, when the order waits in one: the page refreshes once when it has passed
 */
export function OrderRefresher({ status, cancelUntil = null }: { status: string; cancelUntil?: string | null }) {
  const router = useRouter();
  useEffect(
    () => watchOrder({ refresh: () => router.refresh(), open: isOpenOrder(status), cancelUntil }),
    [router, status, cancelUntil],
  );
  return null;
}
