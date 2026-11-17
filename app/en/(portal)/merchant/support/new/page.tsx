// New support ticket for a merchant (feature 28): the public form's fields without the email, the name and the security
// check, and a picker with their recent orders. After saving, the merchant lands on the live thread. The frame is static; the
// orders are read with the session (a merchant waiting for approval has none: the picker is then left out).
// `?order=<id>` preselects that order in the picker ("Open a new ticket" of a closed ticket carries it).
import type { Metadata } from "next";
import { Suspense } from "react";
import { apiSessionList } from "@/lib/api/server";
import { listQuery } from "@/lib/api/query";
import type { MerchantOrder } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { sitePath } from "@/lib/site-path";
import { fmt } from "@/lib/i18n/define";
import { common } from "@/lib/i18n/messages/common";
import { portal } from "@/lib/i18n/messages/portal";
import { support } from "@/lib/i18n/messages/support";
import { orderParam } from "@/lib/support/new-ticket-link";
import { PageHeader } from "@/components/layout/container";
import { SignedInTicketForm } from "@/components/support/signed-in-ticket-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/layout/page-transition";

/** The recent orders offered in the picker. */
const ORDER_CHOICES = 50;

export function generateMetadata(): Metadata {
  const t = portal;
  return { title: t.merchantSupport.newMetaTitle, robots: { index: false, follow: false } };
}

function FormSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-5">
      <Skeleton className="h-[4.5rem]" />
      <Skeleton className="h-[12rem]" />
      <Skeleton className="h-[7rem]" />
      <Skeleton className="h-12 w-40" />
    </div>
  );
}

async function NewTicketLoader({ searchParams }: { searchParams: PageProps<"/en/merchant/support/new">["searchParams"] }) {
  const sp = await searchParams;
  const s = support;
  const orderId = orderParam(sp.order);
  // The picker is a convenience: a failed read (or a pending merchant's 403) leaves it out; the ticket can still be opened.
  const orders = await apiSessionList<MerchantOrder>("/client/orders", { query: listQuery({ start: 0, end: ORDER_CHOICES, sort: "createdAt", order: "desc" }) })
    .then((list) => list.data)
    .catch(() => []);
  return (
    <SignedInTicketForm
      area="merchant"
      t={{ form: s.form, newForm: s.newForm }}
      defaultOrderId={orderId}
      orders={[
        // An order older than the recent ones the picker lists: offered by its number alone (none for a pending merchant).
        ...(orderId !== null && orders.length > 0 && !orders.some((order) => order.id === orderId) ? [{ id: orderId, label: `#${orderId}` }] : []),
        ...orders.map((order) => ({
          id: order.id,
          label: fmt(s.newForm.orderOption, { order: `#${order.id}`, service: order.service.name, date: formatDate(order.createdAt) }),
        })),
      ]}
    />
  );
}

export default function NewMerchantTicketPage({ searchParams }: PageProps<"/en/merchant/support/new">) {
  const t = portal;
  const c = common;
  return (
    <PageTransition>
      <div className="grid gap-6">
        <PageHeader
          eyebrow={
            <Breadcrumbs
              label={c.workspace.breadcrumbLabel}
              items={[{ label: t.merchantSupport.title, href: sitePath("/merchant/support") }, { label: t.merchantSupport.newTitle }]}
            />
          }
          title={t.merchantSupport.newTitle}
          description={t.merchantSupport.newSubtitle}
        />
        <Card>
          <CardBody>
            <Suspense fallback={<FormSkeleton />}>
              <NewTicketLoader searchParams={searchParams} />
            </Suspense>
          </CardBody>
        </Card>
      </div>
    </PageTransition>
  );
}
