// A support ticket, opened from the link in its email or from the Support list of an account (`/support/tickets/<token>`).
// The token IS the credential: the page is never indexed and sends no Referer. The ticket is read at request time, so it
// streams behind <Suspense>; that read is the first state of the live conversation (`TicketView`, feature 28): messages,
// seen marks and files arrive through the ticket's own stream, with no reload and no `router.refresh()`. A closed
// (resolved) ticket offers a new one: the account's form to a signed-in account (with the order), the public form to a guest.
import type { Metadata } from "next";
import { Suspense } from "react";
import { apiSessionGet } from "@/lib/api/server";
import { getAccount } from "@/lib/api/session";
import { isApiError } from "@/lib/api/errors";
import { BusyState } from "@/components/ui/busy-state";
import type { Ticket } from "@/lib/api/types";
import { sitePath } from "@/lib/site-path";
import { fmt } from "@/lib/i18n/define";
import { common } from "@/lib/i18n/messages/common";
import { support } from "@/lib/i18n/messages/support";
import { newTicketHref } from "@/lib/support/new-ticket-link";
import { TicketView } from "@/components/support/ticket-view";
import { Container, PageHeader } from "@/components/layout/container";
import { PageTransition } from "@/components/layout/page-transition";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function generateMetadata(): Metadata {
  const t = support;
  return { title: t.ticket.metaTitle, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

function TicketSkeleton() {
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

async function TicketContent({ params }: { params: PageProps<"/en/support/tickets/[token]">["params"] }) {
  const [{ token }, me] = await Promise.all([
    params,
    getAccount().catch(() => null),
  ]);
  const t = support;
  const c = common;
  let ticket: Ticket;
  try {
    ticket = await apiSessionGet<Ticket>(`/store/v1/tickets/${encodeURIComponent(token)}`);
  } catch (error) {
    if (isApiError(error) && error.status === 429) {
      return <BusyState error={error} retryHref={sitePath(`/support/tickets/${encodeURIComponent(token)}`)} />;
    }
    // A wrong or cut-off token: 404 (a token of the wrong length can answer 422). Everything else is a real failure.
    if (isApiError(error) && (error.status === 404 || error.status === 422)) {
      return (
        <PageHeader
          title={t.ticket.notFoundTitle}
          description={t.ticket.notFoundText}
          actions={<ButtonLink href={sitePath("/support")}>{t.ticket.newTicket}</ButtonLink>}
        />
      );
    }
    throw error;
  }

  return (
    <TicketView
      t={t}
      c={c}
      ticket={ticket}
      access={{ kind: "token", token }}
      breadcrumbs={[{ label: t.ticket.support, href: sitePath("/support") }, { label: fmt(t.ticket.number, { number: ticket.number }) }]}
      order={ticket.orderId ? { text: `SF-${ticket.orderId}` } : null}
      newTicketHref={newTicketHref(Boolean(me), ticket.orderId)}
    />
  );
}

export default function TicketPage({ params }: PageProps<"/en/support/tickets/[token]">) {
  return (
    // min-h keeps the footer below the first screen while the ticket streams in, so nothing visible moves.
    <PageTransition>
      <Container className="min-h-[56rem] py-8 sm:py-12">
        <Suspense fallback={<TicketSkeleton />}>
          <TicketContent params={params} />
        </Suspense>
      </Container>
    </PageTransition>
  );
}
