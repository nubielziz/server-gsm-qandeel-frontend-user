// New ticket for a signed-in customer (feature 28): the public form's fields without the email, the name and the security
// check, and a picker with their recent orders. After saving, the customer lands on the ticket's conversation page. The frame
// is static; the orders are read with the session, so the form streams behind <Suspense> with a same-size skeleton.
// `?order=<id>` preselects that order in the picker ("Open a new ticket" of a closed ticket carries it).
import type { Metadata } from "next";
import { Suspense } from "react";
import { apiSessionList } from "@/lib/api/server";
import { listQuery } from "@/lib/api/query";
import type { CustomerOrder } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { sitePath } from "@/lib/site-path";
import { fmt } from "@/lib/i18n/define";
import { account } from "@/lib/i18n/messages/account";
import { common } from "@/lib/i18n/messages/common";
import { support } from "@/lib/i18n/messages/support";
import { orderParam } from "@/lib/support/new-ticket-link";
import { orderLabel } from "@/components/account/orders-table";
import { PageHeader } from "@/components/layout/container";
import { SignedInTicketForm } from "@/components/support/signed-in-ticket-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/layout/page-transition";

/** The recent orders offered in the picker. */
const ORDER_CHOICES = 50;

export function generateMetadata(): Metadata {
  const t = account;
  return { title: t.tickets.newMetaTitle, robots: { index: false, follow: false } };
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

async function NewTicketLoader({ searchParams }: { searchParams: PageProps<"/en/account/tickets/new">["searchParams"] }) {
  const sp = await searchParams;
  const s = support;
  const orderId = orderParam(sp.order);
  // The picker is a convenience: a failed read leaves it out and the ticket can still be opened.
  const orders = await apiSessionList<CustomerOrder>("/store/v1/me/orders", { query: listQuery({ start: 0, end: ORDER_CHOICES }) })
    .then((list) => list.data)
    .catch(() => []);
  return (
    <SignedInTicketForm
      area="customer"
      t={{ form: s.form, newForm: s.newForm }}
      defaultOrderId={orderId}
      orders={[
        // An order older than the recent ones the picker lists: offered by its number alone.
        ...(orderId !== null && !orders.some((order) => order.id === orderId) ? [{ id: orderId, label: orderLabel(orderId) }] : []),
        ...orders.map((order) => ({
          id: order.id,
          label: fmt(s.newForm.orderOption, { order: orderLabel(order.id), service: order.service.name, date: formatDate(order.createdAt) }),
        })),
      ]}
    />
  );
}

export default function NewTicketPage({ searchParams }: PageProps<"/en/account/tickets/new">) {
  const t = account;
  const c = common;
  return (
    <PageTransition>
      <div className="grid gap-4">
        <PageHeader
          variant="card"
          eyebrow={
            <Breadcrumbs
              label={c.workspace.breadcrumbLabel}
              items={[{ label: t.tickets.title, href: sitePath("/account/tickets") }, { label: t.tickets.newTitle }]}
            />
          }
          title={t.tickets.newTitle}
          description={t.tickets.newSubtitle}
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
