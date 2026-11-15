// TicketView: the body of a ticket page, shared by the customer's token page (`/support/tickets/<token>`) and the merchant's
// thread (`/merchant/support/<id>`) (feature 28). Server component: the header, the cards and the fixed facts are static
// output; everything that changes while the page is open (the messages, the status badge, the dates, the rating, the reply
// box) is a client leaf inside `<TicketLive>` (`ticket-conversation.tsx`), which owns the state and the stream.
// Conversation on the start side, ticket information on the end side (Support Tickets mockup).
import Link from "next/link";
import type { Ticket } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { statusLabel, type CommonMessages } from "@/lib/i18n/messages/common";
import type { SupportMessages } from "@/lib/i18n/messages/support";
import type { TicketSource } from "@/lib/support/conversation";
import type { TicketStatus } from "@/lib/support/ticket-events";
import {
  LiveTicketFacts,
  LiveTicketStatus,
  TicketConversation,
  TicketLive,
  type TicketAccess,
} from "@/components/support/ticket-conversation";
import { PageHeader } from "@/components/layout/container";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/ui/breadcrumbs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";

/** What both ticket answers (`Ticket`, `ClientTicket`) hold; the rating exists for customers only. */
export type TicketViewTicket = Omit<Ticket, "canRate" | "csatScore"> & Partial<Pick<Ticket, "canRate" | "csatScore">>;

export type TicketViewProps = {
  locale: Locale;
  t: SupportMessages;
  c: CommonMessages;
  ticket: TicketViewTicket;
  access: TicketAccess;
  breadcrumbs: BreadcrumbItem[];
  /** The related order as the area names it (`SF-12`, `#12`); `href` where the area has a page for it. */
  order: { text: string; href?: string } | null;
};

const STATUSES: readonly TicketStatus[] = ["new", "open", "pending", "resolved"];

export function TicketView({ locale, t, c, ticket, access, breadcrumbs, order }: TicketViewProps) {
  const i = t.ticket.info;
  const category = t.ticket.categories[ticket.category];
  const statuses = Object.fromEntries(STATUSES.map((status) => [status, statusLabel(c, "ticket", status)])) as Record<TicketStatus, string>;
  const source: TicketSource = {
    status: ticket.status,
    updatedAt: ticket.updatedAt,
    resolvedAt: ticket.resolvedAt,
    canRate: ticket.canRate,
    csatScore: ticket.csatScore,
    messages: ticket.messages,
    seenByYou: ticket.seenByYou,
    seenBySupport: ticket.seenBySupport,
  };

  return (
    <TicketLive number={ticket.number} access={access} source={source}>
      <div className="grid gap-6">
        <PageHeader
          eyebrow={<Breadcrumbs label={t.ticket.breadcrumbs} items={breadcrumbs} />}
          title={ticket.subject}
          description={`${fmt(t.ticket.number, { number: ticket.number })} · ${category}`}
          actions={<LiveTicketStatus labels={statuses} />}
        />

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card as="section" aria-labelledby="conversation">
            <CardHeader title={<span id="conversation">{t.ticket.conversation}</span>} />
            <CardBody className="grid gap-6">
              <TicketConversation
                locale={locale}
                t={{
                  conversation: t.ticket.conversation,
                  you: t.ticket.you,
                  team: t.ticket.team,
                  sentAt: t.ticket.sentAt,
                  reply: t.ticket.reply,
                  csat: t.ticket.csat,
                  chat: t.ticket.chat,
                }}
              />
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
                {order ? (
                  <DescriptionItem label={i.order}>
                    {order.href ? (
                      <Link href={order.href} prefetch={false} className="num font-semibold underline decoration-1 underline-offset-4 hover:decoration-2">
                        {order.text}
                      </Link>
                    ) : (
                      <span className="num">{order.text}</span>
                    )}
                  </DescriptionItem>
                ) : null}
                <DescriptionItem label={i.created}>{formatDateTime(ticket.createdAt, locale)}</DescriptionItem>
                <LiveTicketFacts locale={locale} labels={{ updated: i.updated, resolved: i.resolved, status: i.status }} statuses={statuses} />
              </DescriptionList>
            </CardBody>
          </Card>
        </div>
      </div>
    </TicketLive>
  );
}
