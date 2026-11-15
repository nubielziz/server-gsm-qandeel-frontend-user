// Delivery log of one webhook endpoint (handoff §4.10): the endpoint's summary (found in the list: there is no
// single-endpoint route) and its deliveries, 25 per page, newest first.
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { apiSessionList } from "@/lib/api/server";
import { requireMerchant } from "@/lib/api/session";
import { listQuery, pageRange, pathOf } from "@/lib/api/query";
import type { Webhook, WebhookDelivery } from "@/lib/api/types";
import { localePath } from "@/lib/i18n/config";
import { common, statusLabel } from "@/lib/i18n/messages/common";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { parsePage } from "@/lib/api/query";
import { utcDate, utcDateTime } from "@/components/merchant-settings/format";
import { LoadError, PendingNotice, settle } from "@/components/merchant-settings/load";
import { ListSkeleton, PageHeaderSkeleton } from "@/components/merchant-settings/skeletons";
import { PageHeader } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { PageTransition } from "@/components/layout/page-transition";

const PAGE_SIZE = 25;
const ID_PATTERN = /^[1-9]\d{0,15}$/;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(merchantSettings);
  return { title: t.webhooks.detail.deliveriesTitle };
}

export default function WebhookDeliveriesPage({ params, searchParams }: PageProps<"/[lang]/merchant/webhooks/[id]">) {
  return (
    <PageTransition>
      <Suspense
        fallback={
          <div className="grid gap-4">
            <PageHeaderSkeleton />
            <ListSkeleton rows={2} rowHeight="h-40" />
          </div>
        }
      >
        <DeliveriesContent params={params} searchParams={searchParams} />
      </Suspense>
    </PageTransition>
  );
}

async function DeliveriesContent({
  params,
  searchParams,
}: {
  params: PageProps<"/[lang]/merchant/webhooks/[id]">["params"];
  searchParams: PageProps<"/[lang]/merchant/webhooks/[id]">["searchParams"];
}) {
  const [{ id }, query, locale] = await Promise.all([params, searchParams, getLocale()]);
  if (!ID_PATTERN.test(id)) notFound();
  const [me, t] = await Promise.all([requireMerchant(locale), getMessages(merchantSettings)]);
  const d = t.webhooks.detail;
  const listPath = localePath(locale, "/merchant/webhooks");
  const back = (
    <Link href={listPath} className="inline-flex min-h-11 items-center gap-1.5 text-small font-semibold text-ink-muted hover:text-ink">
      <ArrowLeft aria-hidden="true" className="size-4 rtl:-scale-x-100" />
      {d.back}
    </Link>
  );
  if (me.status === "pending") {
    return (
      <div className="grid gap-4">
        <PageHeader variant="card" eyebrow={back} title={d.caption} />
        <PendingNotice locale={locale} />
      </div>
    );
  }

  const page = parsePage(query.page);
  const { start, end } = pageRange(page, PAGE_SIZE);
  const [endpoints, deliveries] = await Promise.all([
    settle(locale, () => apiSessionList<Webhook>("/client/webhooks", { query: listQuery({ start: 0, end: 100 }) })),
    settle(locale, () =>
      apiSessionList<WebhookDelivery>(pathOf("/client/webhooks/:id/deliveries", { id }), {
        query: listQuery({ start, end, sort: "createdAt", order: "desc" }),
      }),
    ),
  ]);
  if (!endpoints.ok) return <LoadError error={endpoints.error} locale={locale} />;
  const endpoint = endpoints.data.data.find((w) => String(w.id) === id);
  if (!endpoint || (!deliveries.ok && deliveries.error.status === 404)) notFound();
  const c = common[locale];

  return (
    <div className="grid gap-4">
      <PageHeader variant="card" eyebrow={back} title={d.caption} description={d.deliveriesText} />

      <Card as="section">
        <CardHeader
          title={d.summary}
          titleAs="h2"
          divided
          actions={<Badge tone={endpoint.isActive ? "success" : "warning"}>{endpoint.isActive ? t.webhooks.active : t.webhooks.pausedTitle}</Badge>}
        />
        <CardBody className="grid gap-4">
          <p className="num break-all font-mono text-body font-semibold text-ink" dir="ltr">
            {endpoint.url}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {endpoint.events.map((e) => (
              <Badge key={e} tone="outline" shape="tag">
                <span dir="ltr">{e}</span>
              </Badge>
            ))}
          </div>
          <p className="text-small text-ink-subtle">
            {t.webhooks.failures}:{" "}
            {endpoint.failureCount > 0 ? t.webhooks.failuresText.replace("{count}", String(endpoint.failureCount)) : t.webhooks.noFailures}
            <span aria-hidden="true"> · </span>
            {t.webhooks.createdAt}: {utcDate(endpoint.createdAt, locale)}
          </p>
        </CardBody>
      </Card>

      <Card as="section">
        <CardHeader title={d.deliveriesTitle} titleAs="h2" divided />
        <CardBody flush>
          {!deliveries.ok ? (
            <LoadError error={deliveries.error} locale={locale} />
          ) : deliveries.data.data.length === 0 ? (
            <EmptyState compact icon={<History aria-hidden="true" />} title={d.empty} description={d.emptyText} />
          ) : (
            <Table stacked caption={d.caption}>
              <TableHead>
                <tr>
                  <TableHeaderCell>{d.event}</TableHeaderCell>
                  <TableHeaderCell numeric>{d.attempt}</TableHeaderCell>
                  <TableHeaderCell>{d.status}</TableHeaderCell>
                  <TableHeaderCell>{d.response}</TableHeaderCell>
                  <TableHeaderCell>{d.error}</TableHeaderCell>
                  <TableHeaderCell>{d.nextRetry}</TableHeaderCell>
                  <TableHeaderCell>{d.time}</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {deliveries.data.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell label={d.event}>
                      <span dir="ltr" className="font-medium">
                        {row.event === "ping" ? d.ping : row.event}
                      </span>
                    </TableCell>
                    <TableCell numeric label={d.attempt}>
                      {row.attempt}
                    </TableCell>
                    <TableCell label={d.status}>
                      <StatusBadge kind="delivery" status={row.status} label={statusLabel(c, "delivery", row.status)} />
                    </TableCell>
                    <TableCell label={d.response}>
                      {row.responseCode === 0 ? <span className="text-ink-subtle">{d.noResponse}</span> : <span className="num">{row.responseCode}</span>}
                    </TableCell>
                    <TableCell label={d.error} className="max-w-64 md:break-words">
                      <span dir="auto">{row.error || t.dash}</span>
                    </TableCell>
                    <TableCell label={d.nextRetry}>{row.nextRetryAt ? utcDateTime(row.nextRetryAt, locale, t.utc) : t.dash}</TableCell>
                    <TableCell label={d.time}>{utcDateTime(row.createdAt, locale, t.utc)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {deliveries.ok ? (
        <Pagination total={deliveries.data.total} pageSize={PAGE_SIZE} page={page} basePath={`${listPath}/${id}`} />
      ) : null}
    </div>
  );
}
