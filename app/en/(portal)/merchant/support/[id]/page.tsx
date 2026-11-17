// One support ticket of the merchant, live (feature 28): the thread of messages with typing, seen marks and files, on the
// merchant stream. The ticket is addressed by its id and the session is the credential: a foreign or unknown id is a 404
// (shown in the page, with the way back to the list). The read is the first state of `TicketView`; nothing here calls
// `router.refresh()`.
import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { apiSessionGet } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import type { ClientTicket } from "@/lib/api/types";
import { sitePath } from "@/lib/site-path";
import { fmt } from "@/lib/i18n/define";
import { common } from "@/lib/i18n/messages/common";
import { portal } from "@/lib/i18n/messages/portal";
import { support } from "@/lib/i18n/messages/support";
import { newTicketHref } from "@/lib/support/new-ticket-link";
import { settle } from "@/lib/merchant/load";
import { PageHeader } from "@/components/layout/container";
import { PageError } from "@/components/merchant/page-error";
import { TicketView } from "@/components/support/ticket-view";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  const t = portal;
  return { title: t.merchantSupport.threadMetaTitle, robots: { index: false, follow: false } };
}

function ThreadSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-6">
      <Skeleton className="h-24" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-[34rem] rounded-card" />
        <Skeleton className="h-72 rounded-card" />
      </div>
    </div>
  );
}

async function Thread({ params }: { params: PageProps<"/en/merchant/support/[id]">["params"] }) {
  const { id } = await params;
  const p = portal;
  const t = support;
  const c = common;
  if (!/^[1-9]\d{0,15}$/.test(id)) notFound();
  const here = sitePath(`/merchant/support/${id}`);
  const result = await settle(apiSessionGet<ClientTicket>(`/client/tickets/${id}`));
  if (!result.ok) {
    if (isApiError(result.error) && (result.error.status === 404 || result.error.status === 422)) {
      return (
        <PageHeader
          title={p.merchantSupport.notFoundTitle}
          description={p.merchantSupport.notFoundText}
          actions={<ButtonLink href={sitePath("/merchant/support")}>{p.merchantSupport.backToList}</ButtonLink>}
        />
      );
    }
    return <PageError error={result.error} next={here} title={p.merchantSupport.title} />;
  }
  const ticket = result.data;
  return (
    <TicketView
      t={t}
      c={c}
      ticket={ticket}
      access={{ kind: "merchant", id: ticket.id }}
      breadcrumbs={[
        { label: p.merchantSupport.title, href: sitePath("/merchant/support") },
        { label: fmt(t.ticket.number, { number: ticket.number }) },
      ]}
      order={ticket.orderId ? { text: `#${ticket.orderId}`, href: sitePath(`/merchant/orders/${ticket.orderId}`) } : null}
      newTicketHref={newTicketHref("merchant", ticket.orderId)}
    />
  );
}

export default function MerchantTicketPage({ params }: PageProps<"/en/merchant/support/[id]">) {
  return (
    <PageTransition>
      <Suspense fallback={<ThreadSkeleton />}>
        <Thread params={params} />
      </Suspense>
    </PageTransition>
  );
}
