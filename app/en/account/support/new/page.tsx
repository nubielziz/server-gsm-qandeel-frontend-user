// New support ticket for a signed-in account (feature 28): the public form's fields without the email, the name and the
// security check, and a picker with the account's recent orders. After saving, a retail account lands on the ticket's token
// page and a merchant rank on its live thread. The frame is static; the orders are read with the session, so the form streams
// behind <Suspense> with a same-size skeleton.
// `?order=<id>` preselects that order in the picker ("Open a new ticket" of a closed ticket carries it).
import type { Metadata } from "next";
import { Suspense } from "react";
import { familyOf, type AccountFamily } from "@/lib/account/family";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { apiSessionList } from "@/lib/api/server";
import { requireAccount } from "@/lib/api/session";
import { listQuery } from "@/lib/api/query";
import type { CustomerOrder, MerchantOrder } from "@/lib/api/types";
import { sitePath } from "@/lib/site-path";
import { common } from "@/lib/i18n/messages/common";
import { support } from "@/lib/i18n/messages/support";
import { supportPages } from "@/lib/i18n/messages/support-pages";
import { orderParam } from "@/lib/support/new-ticket-link";
import { PageHeader } from "@/components/layout/container";
import { SignedInTicketForm } from "@/components/support/signed-in-ticket-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { orderChoices, type RecentOrder } from "../order-choices";

/** The recent orders offered in the picker. */
const ORDER_CHOICES = 50;

export function generateMetadata(): Metadata {
  const t = supportPages;
  return { title: t.newTicket.metaTitle, robots: { index: false, follow: false } };
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

/** The account's newest orders from the routes of its family. The picker is a convenience: a failed read leaves it empty. */
async function recentOrders(family: AccountFamily): Promise<RecentOrder[]> {
  try {
    if (family === "client") {
      const { data } = await apiSessionList<MerchantOrder>(FAMILY_ROUTES.client.orders, {
        query: listQuery({ start: 0, end: ORDER_CHOICES, sort: "createdAt", order: "desc" }),
      });
      return data.map((order) => ({ id: order.id, service: order.service.name, createdAt: order.createdAt }));
    }
    const { data } = await apiSessionList<CustomerOrder>(FAMILY_ROUTES.store.orders, {
      query: listQuery({ start: 0, end: ORDER_CHOICES }),
    });
    return data.map((order) => ({ id: order.id, service: order.service.name, createdAt: order.createdAt }));
  } catch {
    return [];
  }
}

async function NewTicketLoader({ searchParams }: { searchParams: PageProps<"/en/account/support/new">["searchParams"] }) {
  const sp = await searchParams;
  const s = support;
  const orderId = orderParam(sp.order);
  const here = sitePath("/account/support/new");
  const me = await requireAccount(orderId === null ? here : `${here}?order=${orderId}`);
  const family = familyOf(me);
  const orders = await recentOrders(family);
  return (
    <SignedInTicketForm
      family={family}
      t={{ form: s.form, newForm: s.newForm }}
      defaultOrderId={orderId}
      orders={orderChoices(family, orders, orderId, s.newForm.orderOption)}
    />
  );
}

export default function NewTicketPage({ searchParams }: PageProps<"/en/account/support/new">) {
  const t = supportPages;
  const c = common;
  return (
    <PageTransition>
      <div className="grid gap-4">
        <PageHeader
          variant="card"
          eyebrow={
            <Breadcrumbs
              label={c.workspace.breadcrumbLabel}
              items={[{ label: t.list.title, href: sitePath("/account/support") }, { label: t.newTicket.title }]}
            />
          }
          title={t.newTicket.title}
          description={t.newTicket.subtitle}
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
