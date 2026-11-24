// Orders, for every account: the same address for every rank, a different list for each kind. A merchant rank gets its filtered
// table with the CSV export (rows open the order's page); every other rank (an unknown kind included: the choice fails closed)
// gets its own orders (rows open the tracking page). The session and the list are read at request time, so the content streams
// behind <Suspense> with a same-height skeleton. The status, filters and page live in the URL.
import type { Metadata } from "next";
import { Suspense } from "react";
import { familyOf } from "@/lib/account/family";
import { requireAccount } from "@/lib/api/session";
import { sitePath } from "@/lib/site-path";
import { account } from "@/lib/i18n/messages/account";
import type { SearchParams } from "@/lib/merchant/lists";
import { PageTransition } from "@/components/layout/page-transition";
import { Skeleton } from "@/components/ui/skeleton";
import { MerchantOrders } from "./merchant-orders";
import { RetailOrders } from "./retail-orders";

export function generateMetadata(): Metadata {
  const t = account;
  return { title: t.orders.metaTitle, robots: { index: false, follow: false } };
}

function OrdersSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-4">
      <Skeleton className="h-[5.5rem] rounded-card" />
      <Skeleton className="h-11" />
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}

async function Orders({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await requireAccount(sitePath("/account/orders"));
  return familyOf(me) === "client" ? (
    <MerchantOrders searchParams={searchParams} />
  ) : (
    <RetailOrders searchParams={searchParams} />
  );
}

export default function OrdersPage({ searchParams }: PageProps<"/en/account/orders">) {
  return (
    <PageTransition>
      <Suspense fallback={<OrdersSkeleton />}>
        <Orders searchParams={searchParams} />
      </Suspense>
    </PageTransition>
  );
}
