// The merchant's support tickets (feature 28): most recent activity first, 20 per page; a row opens the live thread
// (`/merchant/support/<id>`: a merchant's ticket has no token, the session is the credential). Open to a merchant waiting
// for approval too (plan B217). The frame is static; the list streams behind <Suspense>, and `TicketsLiveRefresh` draws it
// again in place when a ticket event arrives.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Headset, Plus } from "lucide-react";
import { apiSessionList } from "@/lib/api/server";
import { listQuery, pageRange, parsePage } from "@/lib/api/query";
import type { ClientTicketRow } from "@/lib/api/types";
import { localePath } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { common } from "@/lib/i18n/messages/common";
import { portal } from "@/lib/i18n/messages/portal";
import { support } from "@/lib/i18n/messages/support";
import { settle } from "@/lib/merchant/load";
import { PageHeader } from "@/components/layout/container";
import { PageError } from "@/components/merchant/page-error";
import { ListSkeleton } from "@/components/merchant/skeletons";
import { TicketList, type TicketListRow } from "@/components/support/ticket-list";
import { TicketsLiveRefresh } from "@/components/support/tickets-live-refresh";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageHref } from "@/components/ui/pagination";

const PAGE_SIZE = 20;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(portal);
  return { title: t.merchantSupport.metaTitle, robots: { index: false, follow: false } };
}

async function Tickets({ searchParams }: { searchParams: PageProps<"/[lang]/merchant/support">["searchParams"] }) {
  const [sp, locale, s, c] = await Promise.all([searchParams, getLocale(), getMessages(support), getMessages(common)]);
  const page = parsePage(sp.page);
  const { start, end } = pageRange(page, PAGE_SIZE);
  const basePath = localePath(locale, "/merchant/support");

  const list = await settle(apiSessionList<ClientTicketRow>("/client/tickets", { query: listQuery({ start, end }) }));
  if (!list.ok) return <PageError error={list.error} next={basePath} />;
  const { data, total } = list.data;
  // A page number past the end (an old bookmark): go back to the first page.
  if (data.length === 0 && total > 0 && page > 1) redirect(pageHref(basePath, {}, 1));

  const rows: TicketListRow[] = data.map((row) => ({
    key: row.id,
    href: localePath(locale, `/merchant/support/${row.id}`),
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
      <TicketsLiveRefresh surface="merchant" />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Headset aria-hidden="true" />}
            title={s.list.emptyTitle}
            description={s.list.emptyText}
            action={<ButtonLink href={localePath(locale, "/merchant/support/new")}>{s.list.emptyAction}</ButtonLink>}
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

export default async function MerchantSupportPage({ searchParams }: PageProps<"/[lang]/merchant/support">) {
  const [locale, t, s] = await Promise.all([getLocale(), getMessages(portal), getMessages(support)]);
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t.merchantSupport.title}
        description={t.merchantSupport.subtitle}
        actions={
          <ButtonLink href={localePath(locale, "/merchant/support/new")} startIcon={<Plus aria-hidden="true" />}>
            {s.list.newTicket}
          </ButtonLink>
        }
      />
      <Suspense fallback={<ListSkeleton rows={6} toolbar={false} />}>
        <Tickets searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
