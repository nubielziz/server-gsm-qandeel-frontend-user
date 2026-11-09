// The end-side column of the settings pages: account summary, security quick links and the help card.
// `AccountSummary` and `SecurityShortcuts` read the signed-in merchant, so the layout renders them inside <Suspense>.
import Link from "next/link";
import { ChevronRight, Headphones, Laptop, Lock, ShieldCheck } from "lucide-react";
import { requireMerchant } from "@/lib/api/session";
import { formatPercent } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { localePath, type Locale } from "@/lib/i18n/config";
import { common, statusLabel } from "@/lib/i18n/messages/common";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { utcMonth } from "./format";

export async function AccountSummary({ locale }: { locale: Locale }) {
  const me = await requireMerchant(locale);
  const t = merchantSettings[locale];
  const c = common[locale];
  return (
    <Card>
      <CardHeader title={t.layout.summary.title} titleAs="h2" divided />
      <CardBody>
        <div className="flex items-center gap-4">
          <Avatar name={me.name || me.email} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-subheading text-ink" dir="auto">
              {me.name || me.email}
            </p>
            <p className="truncate text-body text-ink-muted" dir="auto">
              {me.company || t.layout.summary.roleFallback}
            </p>
          </div>
        </div>
        <DescriptionList className="mt-4">
          <DescriptionItem label={t.layout.summary.memberSince}>{utcMonth(me.createdAt, locale)}</DescriptionItem>
          <DescriptionItem label={t.layout.summary.group}>
            <span dir="auto">{me.group.name}</span>
            <span className="block text-small font-normal text-ink-subtle">
              {fmt(t.layout.summary.discount, { percent: formatPercent(me.group.discountPercent, locale) })}
            </span>
          </DescriptionItem>
          <DescriptionItem label={t.layout.summary.status}>
            <StatusBadge kind="account" status={me.status} label={statusLabel(c, "account", me.status)} />
          </DescriptionItem>
        </DescriptionList>
      </CardBody>
    </Card>
  );
}

export async function SecurityShortcuts({ locale }: { locale: Locale }) {
  const me = await requireMerchant(locale);
  const t = merchantSettings[locale].layout.quick;
  const base = localePath(locale, "/merchant/settings/security");
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
              <ChevronRight aria-hidden="true" className="text-ink-subtle rtl:-scale-x-100" />
            </Link>
          </li>
          <li>
            <Link href={`${base}#two-factor`} className={rowClasses}>
              <ShieldCheck aria-hidden="true" className="text-ink-muted" />
              <span className="min-w-0 flex-1">
                {t.twoFactor}
                <span className={me.twofaEnabled ? "block text-small font-semibold text-success-ink" : "block text-small font-normal text-ink-subtle"}>
                  {me.twofaEnabled ? t.on : t.off}
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="text-ink-subtle rtl:-scale-x-100" />
            </Link>
          </li>
          <li>
            <Link href={`${base}#sessions`} className={rowClasses}>
              <Laptop aria-hidden="true" className="text-ink-muted" />
              <span className="flex-1">{t.sessions}</span>
              <ChevronRight aria-hidden="true" className="text-ink-subtle rtl:-scale-x-100" />
            </Link>
          </li>
        </ul>
        <Link href={base} className="mt-3 inline-flex min-h-11 items-center text-body font-semibold text-ink underline underline-offset-4">
          {t.manage}
        </Link>
      </CardBody>
    </Card>
  );
}

export function HelpCard({ locale }: { locale: Locale }) {
  const t = merchantSettings[locale].layout.help;
  return (
    <Card tone="muted" className="gap-3 p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <Headphones aria-hidden="true" className="size-7 shrink-0 text-ink" />
        <h2 className="text-heading text-ink">{t.title}</h2>
      </div>
      <p className="text-body text-ink-muted">{t.text}</p>
      <ButtonLink href={localePath(locale, "/help")} variant="secondary" block>
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
      <Skeleton className="h-[16.5rem] rounded-card" />
    </>
  );
}
