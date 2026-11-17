// API keys (handoff §4.9): list, create (secret shown once), edit name / allowed IPs, revoke.
// Needs an approved merchant: a pending one (403 ACCOUNT_PENDING_APPROVAL) sees the notice, never a sign-out.
import { Suspense } from "react";
import type { Metadata } from "next";
import { apiSessionList } from "@/lib/api/server";
import { requireMerchant } from "@/lib/api/session";
import { listQuery } from "@/lib/api/query";
import type { ApiKey } from "@/lib/api/types";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { ApiKeysManager, type KeyRow } from "@/components/merchant-settings/api-keys-manager";
import { CodeBlock } from "@/components/merchant-settings/code-block";
import { isPast, utcDate, utcDateTime } from "@/components/merchant-settings/format";
import { LoadError, PendingNotice, settle } from "@/components/merchant-settings/load";
import { ListSkeleton, PageHeaderSkeleton } from "@/components/merchant-settings/skeletons";
import { PageHeader } from "@/components/layout/container";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageTransition } from "@/components/layout/page-transition";

const MAX_LIVE_KEYS = 10;

export function generateMetadata(): Metadata {
  const t = merchantSettings;
  return { title: t.apiKeys.title };
}

export default function ApiKeysPage() {
  return (
    <PageTransition>
      <Suspense
        fallback={
          <div className="grid gap-4">
            <PageHeaderSkeleton />
            <ListSkeleton rows={3} rowHeight="h-56" />
          </div>
        }
      >
        <ApiKeysContent />
      </Suspense>
    </PageTransition>
  );
}

async function ApiKeysContent() {
  const me = await requireMerchant();
  const t = merchantSettings;
  const heading = <PageHeader variant="card" title={t.apiKeys.title} description={t.apiKeys.description} />;
  if (me.status === "pending") {
    return (
      <div className="grid gap-4">
        {heading}
        <PendingNotice />
      </div>
    );
  }
  const keys = await settle(() =>
    apiSessionList<ApiKey>("/client/api-keys", { query: listQuery({ start: 0, end: 200 }) }),
  );
  if (!keys.ok) {
    return (
      <div className="grid gap-4">
        {heading}
        <LoadError error={keys.error} />
      </div>
    );
  }

  const live = keys.data.data.filter((k) => k.revokedAt === null);
  const revoked = keys.data.data.filter((k) => k.revokedAt !== null);
  const rows: KeyRow[] = [...live, ...revoked].map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes,
    allowedIps: k.allowedIps,
    rateLimitPerMin: k.rateLimitPerMin,
    lastUsed: k.lastUsedAt ? utcDateTime(k.lastUsedAt, t.utc) : null,
    lastUsedIp: k.lastUsedIp,
    expires: k.expiresAt ? utcDate(k.expiresAt) : null,
    created: utcDate(k.createdAt),
    revoked: k.revokedAt !== null,
    expired: k.revokedAt === null && k.expiresAt !== null && isPast(k.expiresAt),
    // Optional in the OpenAPI type, always sent by the server (BH §5.4).
    createdByStaff: k.createdByStaff === true,
  }));
  const base = (process.env.NEXT_PUBLIC_API_PUBLIC_URL ?? "").replace(/\/+$/, "");
  const h = t.apiKeys.help;

  return (
    <div className="grid gap-4">
      <ApiKeysManager
        rows={rows}
        liveCount={live.length}
        max={MAX_LIVE_KEYS}
        t={t.apiKeys}
        fieldTexts={t.fieldErrors}
        optional={t.optional}
      />
      <Card tone="muted">
        <CardHeader title={h.title} titleAs="h2" />
        <CardBody className="grid gap-5">
          <div className="grid gap-2">
            <h3 className="text-subheading text-ink">{h.rest}</h3>
            <p className="text-body text-ink-muted">{h.restText}</p>
            <CodeBlock label={h.rest}>{"Authorization: Bearer <your key>"}</CodeBlock>
            {base ? (
              <p className="text-small text-ink-subtle">
                {h.baseUrl}: <span dir="ltr" className="num font-medium text-ink">{`${base}/v1`}</span>
              </p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <h3 className="text-subheading text-ink">{h.dhru}</h3>
            <p className="text-body text-ink-muted">{h.dhruText}</p>
            <CodeBlock label={h.dhru}>{`${h.username}: ${me.username}\n${h.accessKey}: <your key>`}</CodeBlock>
            {base ? (
              <p className="text-small text-ink-subtle">
                {h.baseUrl}: <span dir="ltr" className="num font-medium text-ink">{`${base}/api/index.php`}</span>
              </p>
            ) : null}
          </div>
          <p className="text-small text-ink-subtle">{h.keep}</p>
        </CardBody>
      </Card>
    </div>
  );
}
