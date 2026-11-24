// The end-side column of the settings pages: account summary, security quick links and the help card, for an account of
// either rank. `AccountSummary` and `SecurityShortcuts` read the signed-in account, so the layout renders them inside
// <Suspense>.
import Link from "next/link";
import { ChevronRight, Headphones, Lock, ShieldCheck } from "lucide-react";
import { rankKindOf } from "@/lib/account/family";
import { SETTINGS_PATHS } from "@/lib/account/settings-nav";
import { requireAccount } from "@/lib/api/session";
import { formatPercent } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { sitePath } from "@/lib/site-path";
import { account } from "@/lib/i18n/messages/account";
import { common, statusLabel } from "@/lib/i18n/messages/common";
import { newTicketHref } from "@/lib/support/new-ticket-link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { utcMonth } from "./format";

export async function AccountSummary() {
  const me = await requireAccount(sitePath(SETTINGS_PATHS.profile));
  const t = account.settings.summary;
  const c = common;
  const merchant = rankKindOf(me) === "merchant";
  return (
    <Card>
      <CardHeader title={t.title} titleAs="h2" divided />
      <CardBody>
        <div className="flex items-center gap-4">
          <Avatar name={me.name || me.email} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-subheading text-ink" dir="auto">
              {me.name || me.email}
            </p>
            <p className="truncate text-body text-ink-muted" dir="auto">
              {me.company || me.rank.name}
            </p>
          </div>
        </div>
        <DescriptionList className="mt-4">
          <DescriptionItem label={t.memberSince}>{utcMonth(me.createdAt)}</DescriptionItem>
          <DescriptionItem label={t.rank}>
            <span dir="auto">{me.rank.name}</span>
            {merchant ? (
              <span className="block text-small font-normal text-ink-subtle">
                {fmt(t.discount, { percent: formatPercent(me.rank.discountPercent) })}
              </span>
            ) : null}
          </DescriptionItem>
          <DescriptionItem label={t.email}>
            <Badge tone={me.emailVerifiedAt ? "success" : "warning"}>{me.emailVerifiedAt ? t.verified : t.notVerified}</Badge>
          </DescriptionItem>
          <DescriptionItem label={t.status}>
            <StatusBadge kind="account" status={me.status} label={statusLabel(c, "account", me.status)} />
          </DescriptionItem>
        </DescriptionList>
      </CardBody>
    </Card>
  );
}

export async function SecurityShortcuts() {
  const me = await requireAccount(sitePath(SETTINGS_PATHS.profile));
  const t = account.settings.quick;
  const base = sitePath(SETTINGS_PATHS.security);
  const rowClasses =
    "flex min-h-11 items-center gap-3 rounded-control px-1 py-1.5 text-body font-medium text-ink transition-colors hover:bg-surface-muted [&_svg]:size-5 [&_svg]:shrink-0";
  return (
    <Card>
      <CardHeader title={t.title} titleAs="h2" divided />
      <CardBody>
        <ul>
          <li>
            <Link href={`${base}#password`} className={rowClasses}>
              <Lock aria-hidden="true" className="text-ink-muted" />
              <span className="flex-1">{t.password}</span>
              <ChevronRight aria-hidden="true" className="text-ink-subtle" />
            </Link>
          </li>
          {/* Two-step is asked after the password, so an account without one is not offered it. */}
          {me.hasPassword ? (
            <li>
              <Link href={`${base}#two-factor`} className={rowClasses}>
                <ShieldCheck aria-hidden="true" className="text-ink-muted" />
                <span className="min-w-0 flex-1">
                  {t.twoFactor}
                  <span
                    className={
                      me.twofaEnabled
                        ? "block text-small font-semibold text-success-ink"
                        : "block text-small font-normal text-ink-subtle"
                    }
                  >
                    {me.twofaEnabled ? t.on : t.off}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="text-ink-subtle" />
              </Link>
            </li>
          ) : null}
        </ul>
        <Link
          href={base}
          className="mt-3 inline-flex min-h-11 items-center text-body font-semibold text-ink underline underline-offset-4"
        >
          {t.manage}
        </Link>
      </CardBody>
    </Card>
  );
}

export function HelpCard() {
  const t = account.settings.help;
  return (
    <Card tone="muted" className="gap-3 p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <Headphones aria-hidden="true" className="size-7 shrink-0 text-ink" />
        <h2 className="text-heading text-ink">{t.title}</h2>
      </div>
      <p className="text-body text-ink-muted">{t.text}</p>
      {/* Settings are for a signed-in account, so the new-ticket form of the account area. */}
      <ButtonLink href={newTicketHref(true, null)} variant="secondary" block>
        {t.action}
      </ButtonLink>
    </Card>
  );
}

/** Same-size placeholders for the two session-dependent cards. */
export function AsideSkeleton() {
  return (
    <>
      <Skeleton className="h-[22rem] rounded-card" />
      <Skeleton className="h-[13.75rem] rounded-card" />
    </>
  );
}
