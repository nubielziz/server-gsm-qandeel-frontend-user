// Webhooks (handoff §4.10): endpoints, create (signing secret shown once), edit, on/off, test, delete, delivery log link.
// Needs an approved merchant: a pending one (403 ACCOUNT_PENDING_APPROVAL) sees the notice, never a sign-out.
import { Suspense } from "react";
import type { Metadata } from "next";
import { apiSessionList } from "@/lib/api/server";
import { requireMerchant } from "@/lib/api/session";
import { listQuery } from "@/lib/api/query";
import type { Webhook } from "@/lib/api/types";
import { sitePath } from "@/lib/site-path";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { CodeBlock } from "@/components/merchant-settings/code-block";
import { utcDate } from "@/components/merchant-settings/format";
import { LoadError, PendingNotice, settle } from "@/components/merchant-settings/load";
import { ListSkeleton, PageHeaderSkeleton } from "@/components/merchant-settings/skeletons";
import { WebhooksManager, type WebhookRow } from "@/components/merchant-settings/webhooks-manager";
import { PageHeader } from "@/components/layout/container";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageTransition } from "@/components/layout/page-transition";

const MAX_ENDPOINTS = 5;

export function generateMetadata(): Metadata {
  const t = merchantSettings;
  return { title: t.webhooks.title };
}

export default function WebhooksPage() {
  return (
    <PageTransition>
      <Suspense
        fallback={
          <div className="grid gap-4">
            <PageHeaderSkeleton />
            <ListSkeleton rows={2} rowHeight="h-48" />
          </div>
        }
      >
        <WebhooksContent />
      </Suspense>
    </PageTransition>
  );
}

async function WebhooksContent() {
  const me = await requireMerchant();
  const t = merchantSettings;
  const heading = <PageHeader variant="card" title={t.webhooks.title} description={t.webhooks.description} />;
  if (me.status === "pending") {
    return (
      <div className="grid gap-4">
        {heading}
        <PendingNotice />
      </div>
    );
  }
  const endpoints = await settle(() =>
    apiSessionList<Webhook>("/client/webhooks", { query: listQuery({ start: 0, end: 100 }) }),
  );
  if (!endpoints.ok) {
    return (
      <div className="grid gap-4">
        {heading}
        <LoadError error={endpoints.error} />
      </div>
    );
  }
  const rows: WebhookRow[] = endpoints.data.data.map((w) => ({
    id: w.id,
    url: w.url,
    events: w.events,
    isActive: w.isActive,
    failureCount: w.failureCount,
    created: utcDate(w.createdAt),
  }));
  const h = t.webhooks.help;

  return (
    <div className="grid gap-4">
      <WebhooksManager
        rows={rows}
        max={MAX_ENDPOINTS}
        basePath={sitePath("/merchant/webhooks")}
        t={t.webhooks}
        fieldTexts={t.fieldErrors}
      />
      <Card tone="muted">
        <CardHeader title={h.title} titleAs="h2" />
        <CardBody className="grid gap-4">
          <div className="grid gap-2">
            <p className="text-body text-ink-muted">{h.body}</p>
            <CodeBlock label={h.body}>{'{ "id": "…", "type": "invoice.paid", "createdAt": "…", "data": { … } }'}</CodeBlock>
          </div>
          <div className="grid gap-2">
            <p className="text-body font-semibold text-ink">{h.headers}</p>
            <CodeBlock label={h.headers}>{"X-GSM-Signature: t=<unix time>,v1=<hex HMAC-SHA256(secret, \"<t>.<body>\")>\nX-GSM-Event-Id: <event id>"}</CodeBlock>
            <ul className="grid list-disc gap-1 ps-5 text-body text-ink-muted">
              <li>{h.signature}</li>
              <li>{h.eventId}</li>
            </ul>
          </div>
          <p className="text-body text-ink-muted">{h.reply}</p>
        </CardBody>
      </Card>
    </div>
  );
}
