// A support ticket, opened from the link in its email (`/support/tickets/<token>`). The token IS the credential: the page
// is never indexed and sends no Referer. Conversation on the start side, ticket information on the end side (Support
// Tickets mockup); reply form, and a 1-5 rating once the ticket is resolved. The ticket is read at request time, so it
// streams behind <Suspense>; a reply calls `router.refresh()` to re-read it.
import type { Metadata } from "next";
import { Suspense } from "react";
import { apiPublicGet } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import type { Ticket } from "@/lib/api/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { localePath } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { common, statusLabel } from "@/lib/i18n/messages/common";
import { support } from "@/lib/i18n/messages/support";
import { TicketCsatForm } from "@/components/support/ticket-csat-form";
import { TicketMessages } from "@/components/support/ticket-messages";
import { TicketReplyForm } from "@/components/support/ticket-reply-form";
import { Container, PageHeader } from "@/components/layout/container";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(support);
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

async function TicketContent({ params }: { params: PageProps<"/[lang]/support/tickets/[token]">["params"] }) {
  const [{ token }, locale, t, c] = await Promise.all([params, getLocale(), getMessages(support), getMessages(common)]);
  let ticket: Ticket;
  try {
    ticket = await apiPublicGet<Ticket>(`/store/v1/tickets/${encodeURIComponent(token)}`);
  } catch (error) {
    // A wrong or cut-off token: 404 (a token of the wrong length can answer 422). Everything else is a real failure.
    if (isApiError(error) && (error.status === 404 || error.status === 422)) {
      return (
        <PageHeader
          title={t.ticket.notFoundTitle}
          description={t.ticket.notFoundText}
          actions={<ButtonLink href={localePath(locale, "/support")}>{t.ticket.newTicket}</ButtonLink>}
        />
      );
    }
    throw error;
  }

  const i = t.ticket.info;
  const category = t.ticket.categories[ticket.category];
  const hint = ticket.status === "resolved" ? t.ticket.reply.reopens : ticket.status === "pending" ? t.ticket.reply.pendingHint : undefined;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={
          <Breadcrumbs
            label={t.ticket.breadcrumbs}
            items={[{ label: t.ticket.support, href: localePath(locale, "/support") }, { label: fmt(t.ticket.number, { number: ticket.number }) }]}
          />
        }
        title={ticket.subject}
        description={`${fmt(t.ticket.number, { number: ticket.number })} · ${category}`}
        actions={<StatusBadge kind="ticket" status={ticket.status} label={statusLabel(c, "ticket", ticket.status)} />}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card as="section" aria-labelledby="conversation">
          <CardHeader title={<span id="conversation">{t.ticket.conversation}</span>} />
          <CardBody className="grid gap-6">
            <TicketMessages messages={ticket.messages} />
            {ticket.canRate ? (
              <div className="rounded-card border border-line bg-surface-muted p-4">
                <TicketCsatForm token={token} t={t.ticket.csat} />
              </div>
            ) : ticket.csatScore ? (
              <Alert tone="success">{fmt(t.ticket.csat.thanks, { score: ticket.csatScore })}</Alert>
            ) : null}
            <div className="border-t border-line pt-5">
              <TicketReplyForm token={token} t={t.ticket.reply} hint={hint} />
            </div>
          </CardBody>
        </Card>

        <Card as="section" aria-labelledby="ticket-info">
          <CardHeader title={<span id="ticket-info">{i.title}</span>} />
          <CardBody className="pt-2">
            <DescriptionList>
              <DescriptionItem label={i.ticket}>
                <span className="num">{ticket.number}</span>
              </DescriptionItem>
              <DescriptionItem label={i.category}>{category}</DescriptionItem>
              {ticket.orderId ? (
                <DescriptionItem label={i.order}>
                  <span className="num">SF-{ticket.orderId}</span>
                </DescriptionItem>
              ) : null}
              <DescriptionItem label={i.created}>{formatDateTime(ticket.createdAt, locale)}</DescriptionItem>
              <DescriptionItem label={i.updated}>{formatDateTime(ticket.updatedAt, locale)}</DescriptionItem>
              {ticket.resolvedAt ? <DescriptionItem label={i.resolved}>{formatDate(ticket.resolvedAt, locale)}</DescriptionItem> : null}
              <DescriptionItem label={i.status}>
                <StatusBadge kind="ticket" status={ticket.status} label={statusLabel(c, "ticket", ticket.status)} />
              </DescriptionItem>
            </DescriptionList>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default function TicketPage({ params }: PageProps<"/[lang]/support/tickets/[token]">) {
  return (
    // min-h keeps the footer below the first screen while the ticket streams in, so nothing visible moves.
    <Container className="min-h-[56rem] py-8 sm:py-12">
      <Suspense fallback={<TicketSkeleton />}>
        <TicketContent params={params} />
      </Suspense>
    </Container>
  );
}
