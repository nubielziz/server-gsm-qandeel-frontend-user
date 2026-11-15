// One order, by tracking token (the token is the customer's only key: never indexed, never cached, never shared).
// Reads the order on the server with the visitor's IP forwarded, so the API's per-IP limit counts the visitor, not the site.
import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { ArrowLeft, Download, Headset, PackageX } from "lucide-react";
import { Container } from "@/components/layout/container";
import { PageTransition } from "@/components/layout/page-transition";
import { Alert } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { CopyPageLink } from "@/components/store/copy-page-link";
import { OrderTimeline } from "@/components/store/order-timeline";
import { ResultCodes } from "@/components/store/result-codes";
import { isApiError } from "@/lib/api/errors";
import { BusyState } from "@/components/ui/busy-state";
import { apiSessionGet } from "@/lib/api/server";
import type { TrackedOrder } from "@/lib/api/types";
import { formatDateTime, formatNumber } from "@/lib/format";
import { localePath } from "@/lib/i18n/config";
import { common, statusLabel } from "@/lib/i18n/messages/common";
import { store } from "@/lib/i18n/messages/store";
import { getLocale, getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(store);
  return { title: t.track.orderTitle, robots: { index: false, follow: false } };
}

export default function TrackedOrderPage(props: PageProps<"/[lang]/track/[token]">) {
  return (
    <PageTransition>
      <Container className="py-8 lg:py-10">
        <Suspense fallback={<OrderSkeleton />}>
          <Order params={props.params} />
        </Suspense>
      </Container>
    </PageTransition>
  );
}

async function Order({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, locale, t, c] = await Promise.all([params, getLocale(), getMessages(store), getMessages(common)]);
  // A per-visitor read of a token route: request time by nature (also keeps Next's prerender check from tripping on the fetch).
  await connection();
  let order: TrackedOrder;
  try {
    order = await apiSessionGet<TrackedOrder>(`/store/v1/orders/${encodeURIComponent(token)}`);
  } catch (error) {
    if (isApiError(error) && error.status === 429) {
      return <BusyState error={error} retryHref={localePath(locale, `/track/${encodeURIComponent(token)}`)} />;
    }
    if (isApiError(error) && (error.status === 404 || error.status === 422)) {
      return (
        <Card className="mx-auto max-w-xl">
          <EmptyState
            icon={<PackageX aria-hidden="true" />}
            title={t.track.notFoundTitle}
            description={t.track.notFoundText}
            action={<ButtonLink href={localePath(locale, "/track")}>{t.track.tryAgain}</ButtonLink>}
          />
        </Card>
      );
    }
    throw error;
  }

  const statusText: Record<TrackedOrder["status"], string> = {
    pending: t.track.pendingText,
    processing: t.track.processingText,
    completed: t.track.completedText,
    rejected: t.track.rejectedText,
  };
  const receiptHref = `/store/v1/orders/${encodeURIComponent(token)}/receipt`;
  const hasRefundOrReject = order.status === "rejected";

  return (
    <>
      <Breadcrumbs
        label={c.workspace.breadcrumbLabel}
        items={[
          { label: t.track.breadcrumbHome, href: localePath(locale) },
          { label: t.track.title, href: localePath(locale, "/track") },
          { label: order.service.name },
        ]}
      />
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardHeader
              title={order.service.name}
              description={statusText[order.status]}
              actions={<StatusBadge kind="order" status={order.status} label={statusLabel(c, "order", order.status)} />}
            />
            <CardBody>
              <DescriptionList>
                {order.input ? (
                  <DescriptionItem label={t.track.input}>
                    <span dir="ltr" className="num">
                      {order.input}
                    </span>
                  </DescriptionItem>
                ) : null}
                <DescriptionItem label={t.track.quantity}>
                  <span className="num">{formatNumber(order.quantity, locale)}</span>
                </DescriptionItem>
                <DescriptionItem label={t.track.delivery}>
                  <bdi>{order.service.deliveryTime}</bdi>
                </DescriptionItem>
                <DescriptionItem label={t.track.placed}>{formatDateTime(order.placedAt, locale)}</DescriptionItem>
                {order.completedAt ? <DescriptionItem label={t.track.completed}>{formatDateTime(order.completedAt, locale)}</DescriptionItem> : null}
              </DescriptionList>
            </CardBody>
          </Card>

          {hasRefundOrReject ? (
            <Alert tone="warning" title={statusLabel(c, "order", order.status)}>
              {t.track.rejectedText}
            </Alert>
          ) : null}

          {order.result ? (
            <Card>
              <CardHeader title={t.track.resultTitle} description={t.track.resultNote} />
              <CardBody className="grid gap-4">
                {order.result.code ? (
                  // A stocked service answers with its codes one per line: a list with a Copy button each (BH §14.5).
                  <ResultCodes
                    code={order.result.code}
                    locale={locale}
                    labels={{
                      title: t.track.codesTitle,
                      copyAll: t.track.copyAll,
                      copyCode: t.track.copyCode,
                      copy: c.actions.copy,
                      copied: c.actions.copied,
                    }}
                  />
                ) : null}
                {order.result.comment ? (
                  <div>
                    <p className="text-small font-semibold text-ink-muted">{t.track.commentLabel}</p>
                    <p className="mt-1 whitespace-pre-wrap text-body text-ink">{order.result.comment}</p>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={t.track.timelineTitle} />
            <CardBody>
              <OrderTimeline events={order.timeline} labels={t.track.timeline} locale={locale} />
            </CardBody>
          </Card>
        </div>

        <aside className="grid content-start gap-4">
          <Card>
            <CardBody className="grid gap-3">
              <h2 className="text-subheading text-ink">{t.track.saveTitle}</h2>
              <p className="text-body text-ink-muted">{t.track.saveText}</p>
              <div>
                <CopyPageLink label={t.track.copyLink} copiedLabel={c.actions.copied} />
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="grid gap-3">
              <a href={receiptHref} target="_blank" rel="noopener" className={buttonClasses({ variant: "secondary", block: true })}>
                <Download aria-hidden="true" />
                {t.track.receipt}
              </a>
              <p className="text-small text-ink-subtle">{t.track.receiptNote}</p>
            </CardBody>
          </Card>
          <Card tone="muted">
            <CardBody className="grid gap-3">
              <h2 className="text-subheading text-ink">{t.track.help}</h2>
              <div>
                <ButtonLink
                  href={`${localePath(locale, "/support")}?order=${encodeURIComponent(token)}`}
                  variant="secondary"
                  startIcon={<Headset aria-hidden="true" />}
                >
                  {t.track.helpCta}
                </ButtonLink>
              </div>
            </CardBody>
          </Card>
          <ButtonLink href={localePath(locale, "/track")} variant="link" startIcon={<ArrowLeft aria-hidden="true" className="rtl:-scale-x-100" />}>
            {t.track.tryAgain}
          </ButtonLink>
        </aside>
      </div>
    </>
  );
}

function OrderSkeleton() {
  return (
    <div aria-busy="true" aria-hidden="true">
      <Skeleton className="h-5 w-72" />
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid content-start gap-6">
          <Skeleton className="h-[21rem] rounded-card" />
          <Skeleton className="h-[12rem] rounded-card" />
          <Skeleton className="h-[17rem] rounded-card" />
        </div>
        <div className="grid content-start gap-4">
          <Skeleton className="h-[11.5rem] rounded-card" />
          <Skeleton className="h-[9.5rem] rounded-card" />
          <Skeleton className="h-[8.5rem] rounded-card" />
        </div>
      </div>
    </div>
  );
}
