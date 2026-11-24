// Support (feature 28): the signed-in account's tickets, most recent activity first, 20 per page. Every account has this page.
// A retail account's rows open the ticket's token page (`/support/tickets/<token>`: the list hands out the token, so no
// emailed link is needed); a merchant rank's rows open the live thread (`/account/support/<id>`: the session is the
// credential). The family comes from the session. The frame is static; the list streams behind <Suspense> with a same-height
// skeleton, and `TicketsLiveRefresh` draws it again in place when a ticket event arrives.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Headset, Plus } from "lucide-react";
import { familyOf, type AccountFamily } from "@/lib/account/family";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { apiSessionList } from "@/lib/api/server";
import { requireAccount } from "@/lib/api/session";
import { listQuery, pageRange, parsePage } from "@/lib/api/query";
import type { ClientTicketRow, MyTicketRow } from "@/lib/api/types";
import { sitePath } from "@/lib/site-path";
import { common } from "@/lib/i18n/messages/common";
import { support } from "@/lib/i18n/messages/support";
import { supportPages } from "@/lib/i18n/messages/support-pages";
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
import { PageTransition } from "@/components/layout/page-transition";
import { clientTicketRows, storeTicketRows } from "./ticket-rows";

const PAGE_SIZE = 20;

export function generateMetadata(): Metadata {
  const t = supportPages;
  return { title: t.list.metaTitle, robots: { index: false, follow: false } };
}

/** One page of the account's tickets from the routes of its family, as rows of the list. */
async function readTickets(family: AccountFamily, start: number, end: number): Promise<{ rows: TicketListRow[]; total: number }> {
  const query = listQuery({ start, end });
  if (family === "client") {
    const { data, total } = await apiSessionList<ClientTicketRow>(FAMILY_ROUTES.client.tickets, { query });
    return { rows: clientTicketRows(data), total };
  }
  const { data, total } = await apiSessionList<MyTicketRow>(FAMILY_ROUTES.store.tickets, { query });
  return { rows: storeTicketRows(data), total };
}

async function Tickets({ searchParams }: { searchParams: PageProps<"/en/account/support">["searchParams"] }) {
  const sp = await searchParams;
  const s = support;
  const c = common;
  const basePath = sitePath("/account/support");
  const me = await requireAccount(basePath);
  const page = parsePage(sp.page);
  const { start, end } = pageRange(page, PAGE_SIZE);

  const list = await settle(readTickets(familyOf(me), start, end));
  if (!list.ok) return <PageError error={list.error} next={basePath} />;
  const { rows, total } = list.data;
  // A page number past the end (an old bookmark): go back to the first page.
  if (rows.length === 0 && total > 0 && page > 1) redirect(pageHref(basePath, {}, 1));

  return (
    <>
      <TicketsLiveRefresh family={familyOf(me)} />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Headset aria-hidden="true" />}
            title={s.list.emptyTitle}
            description={s.list.emptyText}
            action={<ButtonLink href={sitePath("/account/support/new")}>{s.list.emptyAction}</ButtonLink>}
          />
        ) : (
          <>
            <TicketList rows={rows} t={s} c={c} />
            <div className="border-t border-line px-5 py-4">
              <Pagination total={total} pageSize={PAGE_SIZE} page={page} basePath={basePath} />
            </div>
          </>
        )}
      </Card>
    </>
  );
}

export default function SupportPage({ searchParams }: PageProps<"/en/account/support">) {
  const t = supportPages;
  const s = support;
  return (
    <PageTransition>
      <div className="grid gap-4">
        <PageHeader
          variant="card"
          title={t.list.title}
          description={t.list.subtitle}
          actions={
            <ButtonLink href={sitePath("/account/support/new")} startIcon={<Plus aria-hidden="true" />}>
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
