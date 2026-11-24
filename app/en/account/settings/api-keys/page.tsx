// API keys (Dhru credentials): list, create (the secret is shown once), edit name and allowed IPs, revoke. A merchant rank has them;
// any other rank is sent to the account home (`requireRank`).
import { Suspense } from "react";
import type { Metadata } from "next";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { SETTINGS_PATHS } from "@/lib/account/settings-nav";
import { apiSessionList } from "@/lib/api/server";
import { requireRank } from "@/lib/api/session";
import { listQuery } from "@/lib/api/query";
import type { ApiKey } from "@/lib/api/types";
import { account } from "@/lib/i18n/messages/account";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { sitePath } from "@/lib/site-path";
import { ApiKeysManager, type KeyRow } from "@/components/merchant-settings/api-keys-manager";
import { CodeBlock } from "@/components/merchant-settings/code-block";
import { isPast, utcDate, utcDateTime } from "@/components/merchant-settings/format";
import { LoadError, settle } from "@/components/merchant-settings/load";
import { ListSkeleton, PageHeaderSkeleton } from "@/components/merchant-settings/skeletons";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageTransition } from "@/components/layout/page-transition";

const MAX_LIVE_KEYS = 10;

export function generateMetadata(): Metadata {
  return { title: account.settings.nav.apiKeys, robots: { index: false, follow: false } };
}

async function ApiKeysContent() {
  const next = sitePath(SETTINGS_PATHS["api-keys"]);
  const me = await requireRank("merchant", next);
  const t = merchantSettings;
  const keys = await settle(
    () => apiSessionList<ApiKey>(FAMILY_ROUTES.client.apiKeys, { query: listQuery({ start: 0, end: 200 }) }),
    next,
  );
  if (!keys.ok) return <LoadError error={keys.error} />;

  const live = keys.data.data.filter((k) => k.revokedAt === null);
  const revoked = keys.data.data.filter((k) => k.revokedAt !== null);
  const rows: KeyRow[] = [...live, ...revoked].map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    allowedIps: k.allowedIps,
    rateLimitPerMin: k.rateLimitPerMin,
    lastUsed: k.lastUsedAt ? utcDateTime(k.lastUsedAt, t.utc) : null,
    lastUsedIp: k.lastUsedIp,
    expires: k.expiresAt ? utcDate(k.expiresAt) : null,
    created: utcDate(k.createdAt),
    revoked: k.revokedAt !== null,
    expired: k.revokedAt === null && k.expiresAt !== null && isPast(k.expiresAt),
    // Optional in the OpenAPI type, always sent by the server.
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
