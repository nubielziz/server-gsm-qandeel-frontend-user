// API keys (Dhru credentials), read only (decision 005, 2026-11-24): the team makes, changes and revokes every key in the admin
// console; the merchant sees its keys here (live first, revoked dimmed) and is pointed to the team for any change. A Server
// Component: nothing on the page writes. Every date arrives already formatted on the server (UTC), so nothing here depends on
// the browser's time zone.
import type { ReactNode } from "react";
import { KeyRound, MessageCircle } from "lucide-react";
import { fmt } from "@/lib/i18n/define";
import type { MerchantSettingsMessages } from "@/lib/i18n/messages/merchant-settings";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { VisuallyHidden } from "@/components/ui/visually-hidden";

/** One key as the page shows it: display strings for dates (formatted on the server). */
export type KeyRow = {
  id: number;
  name: string;
  prefix: string;
  allowedIps: string[];
  rateLimitPerMin: number;
  /** "Nov 9, 2026, 14:05 UTC" or null when never used. */
  lastUsed: string | null;
  lastUsedIp: string;
  /** "Dec 1, 2026" or null for no expiry. */
  expires: string | null;
  created: string;
  revoked: boolean;
  expired: boolean;
};

/** Where "Contact us" goes: a WhatsApp chat with the team (a new tab), or the shop's support page when no number is set. */
export type KeysContact = { href: string; external: boolean };

export type ApiKeysListProps = {
  rows: KeyRow[];
  contact: KeysContact;
  t: MerchantSettingsMessages["apiKeys"];
};

/**
 * The merchant's API keys, read only: the section card with "Contact us", then one card per key (or an empty state).
 *
 * Why: decision 005 (backend decision 067): only staff make and manage keys, so the page offers no create, edit or revoke.
 */
export function ApiKeysList({ rows, contact, t }: ApiKeysListProps) {
  const action = <ContactLink contact={contact} t={t} />;
  return (
    <div className="grid gap-4">
      <Card as="section">
        <CardHeader title={t.title} titleAs="h2" description={t.description} actions={action} className="pb-5 sm:pb-6" />
      </Card>
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={<KeyRound aria-hidden="true" />} title={t.empty} description={t.emptyText} />
        </Card>
      ) : (
        <ul className="grid gap-4">
          {rows.map((row) => (
            <li key={row.id}>
              <KeyCard row={row} t={t} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Contact us": a chat with the team on WhatsApp (says it opens a new tab), else the support page. */
function ContactLink({ contact, t }: { contact: KeysContact; t: ApiKeysListProps["t"] }) {
  return (
    <ButtonLink href={contact.href} external={contact.external} variant="secondary" startIcon={<MessageCircle aria-hidden="true" />}>
      {t.contact}
      {contact.external ? <VisuallyHidden> ({t.opensNewTab})</VisuallyHidden> : null}
    </ButtonLink>
  );
}

function KeyCard({ row, t }: { row: KeyRow; t: ApiKeysListProps["t"] }) {
  if (row.revoked) {
    // A revoked key is history: one dimmed line instead of the full card.
    return (
      <Card as="article" tone="muted">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3.5 sm:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-body font-semibold text-ink-muted" dir="auto">
              {row.name}
            </h3>
            <code dir="ltr" className="num rounded-badge bg-surface-sunken px-1.5 py-0.5 font-mono text-small text-ink-muted">
              {row.prefix}…
            </code>
            <Badge tone="neutral">{t.revoked}</Badge>
          </div>
          <p className="text-small text-ink-subtle">
            {t.createdAt}: {row.created}
            <span aria-hidden="true"> · </span>
            {t.lastUsed}: {row.lastUsed ?? t.neverUsed}
          </p>
        </div>
      </Card>
    );
  }
  const state = row.expired ? { tone: "warning" as const, label: t.expired } : { tone: "success" as const, label: t.active };
  return (
    <Card as="article" tone={row.expired ? "muted" : "default"}>
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <h3 className="text-subheading text-ink" dir="auto">
          {row.name}
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-small text-ink-subtle">
          <code dir="ltr" className="num rounded-badge bg-surface-sunken px-1.5 py-0.5 font-mono text-ink-muted">
            {row.prefix}…
          </code>
          <Badge tone={state.tone}>{state.label}</Badge>
        </p>
      </div>
      <dl className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
        <Detail label={t.allowedIps}>
          {row.allowedIps.length === 0 ? (
            t.anyIp
          ) : (
            <bdi dir="ltr" className="num break-words">
              {row.allowedIps.join(", ")}
            </bdi>
          )}
        </Detail>
        <Detail label={t.rate}>{fmt(t.perMinute, { count: row.rateLimitPerMin })}</Detail>
        <Detail label={t.lastUsed}>
          {row.lastUsed ? (
            <>
              {row.lastUsed}
              {row.lastUsedIp ? (
                <span className="block text-small font-normal text-ink-subtle">
                  <bdi dir="ltr" className="num">
                    {row.lastUsedIp}
                  </bdi>
                </span>
              ) : null}
            </>
          ) : (
            t.neverUsed
          )}
        </Detail>
        <Detail label={t.expires}>{row.expires ?? t.noExpiry}</Detail>
        <Detail label={t.createdAt}>{row.created}</Detail>
      </dl>
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-small text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 text-body font-medium text-ink">{children}</dd>
    </div>
  );
}
