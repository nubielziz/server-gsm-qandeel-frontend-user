// My orders: status tabs, a table (cards on phones), 20 per page. The status and page live in the URL. The page frame is
// static; the list reads the session and `searchParams`, so it streams behind <Suspense> with a same-height skeleton.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ClipboardList } from "lucide-react";
import { apiSessionList } from "@/lib/api/server";
import { listQuery, pageRange, parsePage } from "@/lib/api/query";
import type { CustomerOrder } from "@/lib/api/types";
import { sitePath } from "@/lib/site-path";
import { fmt } from "@/lib/i18n/define";
import { account } from "@/lib/i18n/messages/account";
import { common, statusLabel } from "@/lib/i18n/messages/common";
import { OrdersTable } from "@/components/account/orders-table";
import { PageHeader } from "@/components/layout/container";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { PageTransition } from "@/components/layout/page-transition";

const PAGE_SIZE = 20;
const STATUSES = ["pending", "processing", "completed", "rejected"] as const;

export function generateMetadata(): Metadata {
  const t = account;
  return { title: t.orders.metaTitle, robots: { index: false, follow: false } };
}

function OrdersSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-4">
      <Skeleton className="h-11" />
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}

async function OrdersContent({ searchParams }: { searchParams: PageProps<"/en/account/orders">["searchParams"] }) {
  const sp = await searchParams;
  const t = account;
  const c = common;
  const raw = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status = STATUSES.find((s) => s === raw);
  const page = parsePage(sp.page);
  const { start, end } = pageRange(page, PAGE_SIZE);
  const basePath = sitePath("/account/orders");
  const filters = status ? { status } : {};

  const { data, total } = await apiSessionList<CustomerOrder>("/store/v1/me/orders", {
    query: listQuery({ start, end }, filters),
  });
  // A page number past the end (an old bookmark): go back to the first page.
  if (data.length === 0 && total > 0 && page > 1) redirect(pageHref(basePath, filters, 1));

  const tabs = [
    { key: "all", label: t.orders.tabAll, href: basePath },
    ...STATUSES.map((s) => ({ key: s, label: statusLabel(c, "order", s), href: pageHref(basePath, { status: s }, 1) })),
  ];

  return (
    <div className="grid gap-4">
      <Tabs label={t.orders.tabsLabel} items={tabs} activeKey={status ?? "all"} />
      <TabPanel activeKey={status ?? "all"}>
        <Card>
          {data.length === 0 ? (
            status ? (
              <EmptyState
                icon={<ClipboardList aria-hidden="true" />}
                title={fmt(t.orders.emptyFilteredTitle, { status: statusLabel(c, "order", status).toLowerCase() })}
                description={t.orders.emptyFilteredText}
                action={
                  <ButtonLink href={basePath} variant="secondary">
                    {t.orders.showAll}
                  </ButtonLink>
                }
              />
            ) : (
              <EmptyState
                icon={<ClipboardList aria-hidden="true" />}
                title={t.orders.emptyTitle}
                description={t.orders.emptyText}
                action={<ButtonLink href={sitePath("/services")}>{t.orders.browse}</ButtonLink>}
              />
            )
          ) : (
            <>
              <OrdersTable orders={data} />
              <div className="border-t border-line px-5 py-4">
                <Pagination total={total} pageSize={PAGE_SIZE} page={page} basePath={basePath} searchParams={filters} />
              </div>
            </>
          )}
        </Card>
      </TabPanel>
    </div>
  );
}

export default function OrdersPage({ searchParams }: PageProps<"/en/account/orders">) {
  const t = account;
  return (
    <PageTransition>
      <div className="grid gap-4">
        <PageHeader variant="card" title={t.orders.title} description={t.orders.subtitle} />
        <Suspense fallback={<OrdersSkeleton />}>
          <OrdersContent searchParams={searchParams} />
        </Suspense>
      </div>
    </PageTransition>
  );
}
