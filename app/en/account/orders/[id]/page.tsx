// One order of a merchant rank (handoff §4.6): what was ordered, the result, verification, the events timeline and the
// actions the API currently allows (cancel / verify). Only a merchant rank has this page: a retail account's orders open on
// their tracking page, so a retail account that comes here is sent to its list.
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/container";
import { OrderActions } from "@/components/merchant/order-actions";
import { PageError } from "@/components/merchant/page-error";
import { DetailSkeleton } from "@/components/merchant/skeletons";
import { TypeBadge } from "@/components/merchant/type-badge";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { familyOf } from "@/lib/account/family";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { apiSessionGet } from "@/lib/api/server";
import { requireAccount } from "@/lib/api/session";
import type { MerchantOrderDetail } from "@/lib/api/types";
import { formatDateTime, formatNumber } from "@/lib/format";
import { sitePath } from "@/lib/site-path";
import { fmt } from "@/lib/i18n/define";
import { common, statusLabel } from "@/lib/i18n/messages/common";
import { merchant } from "@/lib/i18n/messages/merchant";
import { humanizeKind, labelOf } from "@/lib/merchant/format";
import { settle } from "@/lib/merchant/load";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  const t = merchant;
  return { title: t.orders.title };
}

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageTransition>
      <Suspense
        fallback={
          <div className="grid gap-6" aria-hidden="true">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-[5.5rem] rounded-card" />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
              <DetailSkeleton rows={8} />
              <DetailSkeleton rows={4} />
            </div>
          </div>
        }
      >
        <Order params={params} />
      </Suspense>
    </PageTransition>
  );
}

async function Order({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = merchant;
  const c = common;
  if (!/^[1-9]\d{0,15}$/.test(id)) notFound();
  const here = sitePath(`/account/orders/${id}`);
  const me = await requireAccount(here);
  if (familyOf(me) !== "client") redirect(sitePath("/account/orders"));
  const result = await settle(apiSessionGet<MerchantOrderDetail>(`${FAMILY_ROUTES.client.orders}/${id}`));
  if (!result.ok) return <PageError error={result.error} next={here} notFoundOn404 title={t.orders.title} />;
  const o = result.data;
  const sources = t.order.sources as Record<string, string>;
  const verification = t.order.verificationStatus as Record<string, string>;
  const events = t.order.events as Record<string, string>;
  const inputs = Object.entries(o.inputs ?? {});
  const hasResult = Boolean(o.result.code || o.result.comment || o.result.fileId);
  const fileLink = (fileId: number, label: string) => (
    // A plain link: `GET /client/files/:id` answers 302 to a short-lived storage URL (handoff §3.13).
    <a href={`/client/files/${fileId}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
      <Download aria-hidden="true" />
      {label}
    </a>
  );

  return (
    <div className="grid gap-6">
      <Breadcrumbs
        label={c.workspace.breadcrumbLabel}
        items={[{ label: t.orders.title, href: sitePath("/account/orders") }, { label: `#${o.id}` }]}
      />
      <PageHeader
        variant="card"
        title={fmt(t.order.title, { id: o.id })}
        description={fmt(t.order.created, { date: formatDateTime(o.createdAt) })}
        actions={<StatusBadge kind="order" status={o.status} label={statusLabel(c, "order", o.status)} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <Card>
            <CardHeader title={t.order.summaryTitle} />
            <CardBody>
              <DescriptionList>
                <DescriptionItem label={t.order.service}>{o.service.name}</DescriptionItem>
                <DescriptionItem label={t.order.type}>
                  <TypeBadge type={o.service.type} t={c} />
                </DescriptionItem>
                {o.imei ? (
                  <DescriptionItem label={t.order.input}>
                    <span className="inline-flex flex-wrap items-center justify-end gap-2">
                      <bdi dir="ltr" className="num break-all">
                        {o.imei}
                      </bdi>
                      <CopyButton value={o.imei} iconOnly />
                    </span>
                  </DescriptionItem>
                ) : null}
                <DescriptionItem label={t.order.quantity}>
                  <span className="num">{formatNumber(o.quantity)}</span>
                </DescriptionItem>
                <DescriptionItem label={t.order.unitPrice}>
                  <Money amount={o.unitPrice} currency={o.currency} />
                </DescriptionItem>
                <DescriptionItem label={t.order.totalPrice} emphasis>
                  <Money amount={o.totalPrice} currency={o.currency} />
                </DescriptionItem>
                <DescriptionItem label={t.order.source}>{sources[o.source] ?? o.source}</DescriptionItem>
                <DescriptionItem label={t.order.created2}>{formatDateTime(o.createdAt)}</DescriptionItem>
                {o.completedAt ? <DescriptionItem label={t.order.completed}>{formatDateTime(o.completedAt)}</DescriptionItem> : null}
              </DescriptionList>
            </CardBody>
          </Card>

          {inputs.length > 0 || o.inputFileId ? (
            <Card>
              <CardHeader title={t.order.inputsTitle} />
              <CardBody>
                <DescriptionList>
                  {inputs.map(([key, value]) => (
                    <DescriptionItem key={key} label={humanizeKind(key)}>
                      <span dir="auto" className="break-words">
                        {String(value)}
                      </span>
                    </DescriptionItem>
                  ))}
                  {o.inputFileId ? <DescriptionItem label={t.order.inputFile}>{fileLink(o.inputFileId, t.order.downloadFile)}</DescriptionItem> : null}
                </DescriptionList>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={t.order.resultTitle} />
            <CardBody className="grid gap-4">
              {hasResult ? (
                <DescriptionList>
                  {o.result.code ? (
                    <DescriptionItem label={t.order.resultCode}>
                      <span className="inline-flex flex-wrap items-start justify-end gap-2">
                        <span dir="auto" className="whitespace-pre-line break-words">
                          {o.result.code}
                        </span>
                        <CopyButton value={o.result.code} iconOnly />
                      </span>
                    </DescriptionItem>
                  ) : null}
                  {o.result.comment ? (
                    <DescriptionItem label={t.order.resultComment}>
                      <span dir="auto" className="whitespace-pre-line break-words">
                        {o.result.comment}
                      </span>
                    </DescriptionItem>
                  ) : null}
                  {o.result.fileId ? <DescriptionItem label={t.order.resultFile}>{fileLink(o.result.fileId, t.order.downloadFile)}</DescriptionItem> : null}
                </DescriptionList>
              ) : (
                <p className="text-body text-ink-muted">{o.status === "completed" || o.status === "rejected" ? t.order.resultNone : t.order.resultPending}</p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="grid min-w-0 gap-6 lg:sticky lg:top-4">
          <Card>
            <CardHeader title={t.order.actionsTitle} />
            <CardBody>
              <OrderActions orderId={o.id} canCancel={o.canCancel} canVerify={o.canVerify} labels={t.order} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t.order.verificationTitle} />
            <CardBody>
              {o.verificationStatus ? (
                <Badge tone={o.verificationStatus === "refunded" ? "danger" : o.verificationStatus === "accepted" ? "success" : "warning"}>{verification[o.verificationStatus]}</Badge>
              ) : (
                <p className="text-body text-ink-muted">{t.order.verificationNone}</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t.order.timelineTitle} />
            <CardBody>
              <ol className="relative grid gap-5 ps-6 before:absolute before:inset-y-1 before:start-[0.4375rem] before:w-px before:bg-line">
                {o.events.map((e) => (
                  <li key={e.id} className="relative">
                    <span aria-hidden="true" className="absolute -start-6 top-1.5 size-3.5 rounded-full border-2 border-surface bg-ink" />
                    <p className="text-body font-semibold text-ink">{labelOf(events, e.type)}</p>
                    {e.message ? (
                      <p className="text-small text-ink-muted" dir="auto">
                        {e.message}
                      </p>
                    ) : null}
                    <p className="text-small text-ink-subtle">{formatDateTime(e.createdAt)}</p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
