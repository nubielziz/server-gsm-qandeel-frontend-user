// My tickets (feature 28): the signed-in customer's support tickets, most recent activity first, 20 per page. A row opens the
// ticket's conversation page (`/support/tickets/<token>`: the list hands out the token, so a signed-in customer needs no
// emailed link). The frame is static; the list reads the session and `searchParams`, so it streams behind <Suspense> with a
// same-height skeleton, and `TicketsLiveRefresh` draws it again in place when a ticket event arrives.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Headset, Plus } from "lucide-react";
import { apiSessionList } from "@/lib/api/server";
import { listQuery, pageRange, parsePage } from "@/lib/api/query";
import type { MyTicketRow } from "@/lib/api/types";
import { localePath } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { account } from "@/lib/i18n/messages/account";
import { common } from "@/lib/i18n/messages/common";
import { support } from "@/lib/i18n/messages/support";
import { PageHeader } from "@/components/layout/container";
import { ListSkeleton } from "@/components/merchant/skeletons";
import { TicketList, type TicketListRow } from "@/components/support/ticket-list";
import { TicketsLiveRefresh } from "@/components/support/tickets-live-refresh";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { PageTransition } from "@/components/layout/page-transition";

const PAGE_SIZE = 20;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(account);
  return { title: t.tickets.metaTitle, robots: { index: false, follow: false } };
}

async function Tickets({ searchParams }: { searchParams: PageProps<"/[lang]/account/tickets">["searchParams"] }) {
  const [sp, locale, s, c] = await Promise.all([searchParams, getLocale(), getMessages(support), getMessages(common)]);
  const page = parsePage(sp.page);
  const { start, end } = pageRange(page, PAGE_SIZE);
  const basePath = localePath(locale, "/account/tickets");

  const { data, total } = await apiSessionList<MyTicketRow>("/store/v1/me/tickets", { query: listQuery({ start, end }) });
  // A page number past the end (an old bookmark): go back to the first page.
  if (data.length === 0 && total > 0 && page > 1) redirect(pageHref(basePath, {}, 1));

  const rows: TicketListRow[] = data.map((row) => ({
    key: row.token,
    href: localePath(locale, `/support/tickets/${encodeURIComponent(row.token)}`),
    number: row.number,
    subject: row.subject,
    category: row.category,
    status: row.status,
    updatedAt: row.updatedAt,
    lastMessageAt: row.lastMessageAt,
    lastMessageFrom: row.lastMessageFrom,
    hasUnread: row.hasUnread,
  }));

  return (
    <>
      <TicketsLiveRefresh surface="customer" />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Headset aria-hidden="true" />}
            title={s.list.emptyTitle}
            description={s.list.emptyText}
            action={<ButtonLink href={localePath(locale, "/account/tickets/new")}>{s.list.emptyAction}</ButtonLink>}
          />
        ) : (
          <>
            <TicketList rows={rows} locale={locale} t={s} c={c} />
            <div className="border-t border-line px-5 py-4">
              <Pagination total={total} pageSize={PAGE_SIZE} page={page} basePath={basePath} />
            </div>
          </>
        )}
      </Card>
    </>
  );
}

export default async function TicketsPage({ searchParams }: PageProps<"/[lang]/account/tickets">) {
  const [locale, t, s] = await Promise.all([getLocale(), getMessages(account), getMessages(support)]);
  return (
    <PageTransition>
      <div className="grid gap-4">
        <PageHeader
          variant="card"
          title={t.tickets.title}
          description={t.tickets.subtitle}
          actions={
            <ButtonLink href={localePath(locale, "/account/tickets/new")} startIcon={<Plus aria-hidden="true" />}>
              {s.list.newTicket}
            </ButtonLink>
          }
        />
        <Suspense fallback={<ListSkeleton rows={6} toolbar={false} />}>
          <Tickets searchParams={searchParams} />
        </Suspense>
      </div>
    </PageTransition>
  );
}
