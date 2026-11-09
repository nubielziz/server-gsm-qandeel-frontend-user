// Referrals and commissions (handoff §4.13): the referral code and link, the commission plan, the merchants
// referred, and the commission list with status tabs, a month filter and paging. The API sends no totals, so none are
// shown. Needs an approved merchant: a pending one sees the notice, never a sign-out.
import { Suspense } from "react";
import type { Metadata } from "next";
import { Gift, Users, Wallet } from "lucide-react";
import { apiSessionGet, apiSessionList } from "@/lib/api/server";
import { requireMerchant } from "@/lib/api/session";
import { listQuery, pageRange, parsePage } from "@/lib/api/query";
import type { Commission, Referrals } from "@/lib/api/types";
import { formatPercent } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { localePath } from "@/lib/i18n/config";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { utcDate } from "@/components/merchant-settings/format";
import { LoadError, PendingNotice, settle } from "@/components/merchant-settings/load";
import { ListSkeleton, PageHeaderSkeleton } from "@/components/merchant-settings/skeletons";
import { PageHeader } from "@/components/layout/container";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Pagination } from "@/components/ui/pagination";
import { Tabs } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";

const PAGE_SIZE = 25;
const STATUSES = ["accrued", "approved", "reversed"] as const;
type CommissionStatus = (typeof STATUSES)[number];
const STATUS_TONES: Record<CommissionStatus, BadgeTone> = { accrued: "warning", approved: "success", reversed: "danger" };
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(merchantSettings);
  return { title: t.referrals.title };
}

export default function ReferralsPage({ searchParams }: PageProps<"/[lang]/merchant/referrals">) {
  return (
    <Suspense
      fallback={
        <div className="grid gap-4">
          <PageHeaderSkeleton />
          <ListSkeleton rows={3} rowHeight="h-48" />
        </div>
      }
    >
      <ReferralsContent searchParams={searchParams} />
    </Suspense>
  );
}

function pick(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function ReferralsContent({ searchParams }: { searchParams: PageProps<"/[lang]/merchant/referrals">["searchParams"] }) {
  const [query, locale] = await Promise.all([searchParams, getLocale()]);
  const [me, t] = await Promise.all([requireMerchant(locale), getMessages(merchantSettings)]);
  const r = t.referrals;
  const heading = <PageHeader variant="card" title={r.title} description={r.description} />;
  if (me.status === "pending") {
    return (
      <div className="grid gap-4">
        {heading}
        <PendingNotice locale={locale} />
      </div>
    );
  }

  // Only valid filters reach the API (an unknown value is a 422 there).
  const rawStatus = pick(query.status);
  const status = STATUSES.find((s) => s === rawStatus);
  const rawPeriod = pick(query.period)?.trim();
  const period = rawPeriod && PERIOD_PATTERN.test(rawPeriod) ? rawPeriod : undefined;
  const periodInvalid = Boolean(rawPeriod) && !period;
  const page = parsePage(query.page);
  const { start, end } = pageRange(page, PAGE_SIZE);

  const [referrals, commissions] = await Promise.all([
    settle(locale, () => apiSessionGet<Referrals>("/client/referrals")),
    settle(locale, () =>
      apiSessionList<Commission>("/client/commissions", {
        query: listQuery({ start, end, sort: "createdAt", order: "desc" }, { status, period }),
      }),
    ),
  ]);
  if (!referrals.ok) {
    return (
      <div className="grid gap-4">
        {heading}
        <LoadError error={referrals.error} locale={locale} />
      </div>
    );
  }
  const ref = referrals.data;
  const base = localePath(locale, "/merchant/referrals");
  const filters: Record<string, string> = {};
  if (status) filters.status = status;
  if (period) filters.period = period;
  const hrefFor = (key: string, month: string | undefined) => {
    const params = new URLSearchParams();
    if (key !== "all") params.set("status", key);
    if (month) params.set("period", month);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const tabHref = (key: string) => hrefFor(key, period);
  const filtered = Boolean(status || period);
  const basisText = (r.basis as Record<string, string>)[ref.plan?.basis ?? ""] ?? ref.plan?.basis ?? "";
  const periodText = (r.periods as Record<string, string>)[ref.plan?.period ?? ""] ?? ref.plan?.period ?? "";
  const kindText = ref.plan ? (r.kinds as Record<string, string>)[ref.plan.kind] ?? ref.plan.kind : "";

  return (
    <div className="grid gap-4">
      {heading}

      <Card as="section">
        <CardHeader title={r.linkTitle} description={r.linkText} titleAs="h2" divided />
        <CardBody className="grid gap-5 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <Input
            label={r.code}
            readOnly
            dir="ltr"
            value={ref.referralCode}
            trailing={<CopyButton value={ref.referralCode} iconOnly label={r.copyCode} />}
          />
          <Input
            label={r.link}
            readOnly
            dir="ltr"
            value={ref.referralLink}
            trailing={<CopyButton value={ref.referralLink} iconOnly label={r.copyLink} />}
          />
        </CardBody>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card as="section">
          <CardHeader title={r.planTitle} titleAs="h2" divided />
          <CardBody>
            {ref.plan ? (
              <DescriptionList>
                <DescriptionItem label={r.planName}>
                  <span dir="auto">{ref.plan.name}</span>
                </DescriptionItem>
                <DescriptionItem label={r.planKind}>{kindText}</DescriptionItem>
                <DescriptionItem label={r.planRate}>
                  <span className="num">{formatPercent(ref.plan.percent, locale)}</span>
                </DescriptionItem>
                <DescriptionItem label={r.planBasis}>
                  <span dir="auto">{basisText}</span>
                </DescriptionItem>
                <DescriptionItem label={r.planPeriod}>{periodText}</DescriptionItem>
                <DescriptionItem label={r.planStart}>{utcDate(ref.plan.startsAt, locale)}</DescriptionItem>
              </DescriptionList>
            ) : (
              <EmptyState compact icon={<Gift aria-hidden="true" />} title={r.noPlan} description={r.noPlanText} />
            )}
          </CardBody>
        </Card>

        <Card as="section">
          <CardHeader
            title={r.referredTitle}
            titleAs="h2"
            divided
            actions={<Badge tone="neutral">{fmt(r.referredCount, { count: ref.referredCount })}</Badge>}
          />
          <CardBody flush={ref.referred.length > 0}>
            {ref.referred.length === 0 ? (
              <EmptyState compact icon={<Users aria-hidden="true" />} title={r.referredEmpty} description={r.referredEmptyText} />
            ) : (
              <>
                <ul className="max-h-80 divide-y divide-line overflow-y-auto" tabIndex={0} aria-label={r.referredTitle}>
                  {ref.referred.map((m, i) => (
                    <li key={`${m.name}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-3 sm:px-6">
                      <span className="min-w-0 font-medium text-ink" dir="auto">
                        {m.name}
                      </span>
                      <span className="text-small text-ink-subtle">
                        {r.joined}: {utcDate(m.joinedAt, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
                {ref.referredCount > ref.referred.length ? (
                  <p className="border-t border-line px-5 py-3 text-small text-ink-subtle sm:px-6">
                    {fmt(r.referredShown, { shown: ref.referred.length, total: ref.referredCount })}
                  </p>
                ) : null}
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <Card as="section">
        <CardHeader title={r.commissionsTitle} description={r.commissionsText} titleAs="h2" />
        <CardBody className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <Tabs
              label={r.tabsLabel}
              activeKey={status ?? "all"}
              items={[
                { key: "all", label: r.tabs.all, href: tabHref("all") },
                ...STATUSES.map((s) => ({ key: s, label: r.tabs[s], href: tabHref(s) })),
              ]}
              className="min-w-0 max-w-full"
            />
            <form method="get" action={base} className="flex flex-wrap items-end gap-3">
              {status ? <input type="hidden" name="status" value={status} /> : null}
              <Input
                label={r.monthLabel}
                type="month"
                name="period"
                pattern="\d{4}-\d{2}"
                placeholder="YYYY-MM"
                defaultValue={period ?? rawPeriod ?? ""}
                error={periodInvalid ? r.monthInvalid : undefined}
                fieldClassName="w-44"
              />
              <div className="flex items-center gap-2 pb-0.5 [&>*]:self-end">
                <Button type="submit" variant="secondary">
                  {r.apply}
                </Button>
                {period ? (
                  <ButtonLink variant="ghost" href={hrefFor(status ?? "all", undefined)}>
                    {r.clearMonth}
                  </ButtonLink>
                ) : null}
              </div>
            </form>
          </div>
        </CardBody>
        <CardBody flush>
          {!commissions.ok ? (
            <LoadError error={commissions.error} locale={locale} />
          ) : commissions.data.data.length === 0 ? (
            <EmptyState
              compact
              icon={<Wallet aria-hidden="true" />}
              title={filtered ? r.emptyFiltered : r.empty}
              description={filtered ? r.emptyFilteredText : r.emptyText}
              action={
                filtered ? (
                  <ButtonLink variant="secondary" href={base}>
                    {t.referrals.tabs.all}
                  </ButtonLink>
                ) : undefined
              }
            />
          ) : (
            <Table stacked caption={r.caption}>
              <TableHead>
                <tr>
                  <TableHeaderCell>{r.period}</TableHeaderCell>
                  <TableHeaderCell>{r.merchant}</TableHeaderCell>
                  <TableHeaderCell numeric>{r.basisAmount}</TableHeaderCell>
                  <TableHeaderCell numeric>{r.percent}</TableHeaderCell>
                  <TableHeaderCell numeric>{r.amount}</TableHeaderCell>
                  <TableHeaderCell>{r.status}</TableHeaderCell>
                  <TableHeaderCell>{r.approved}</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {commissions.data.data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell label={r.period}>
                      <span className="num" dir="ltr">
                        {c.period}
                      </span>
                    </TableCell>
                    <TableCell label={r.merchant}>
                      <span dir="auto">{c.merchant.name}</span>
                    </TableCell>
                    <TableCell numeric label={r.basisAmount}>
                      <Money amount={c.basisAmount} currency="USD" locale={locale} />
                    </TableCell>
                    <TableCell numeric label={r.percent}>
                      {formatPercent(c.percent, locale)}
                    </TableCell>
                    <TableCell numeric label={r.amount}>
                      <Money amount={c.amount} currency="USD" locale={locale} className="font-semibold" />
                    </TableCell>
                    <TableCell label={r.status}>
                      <Badge tone={STATUS_TONES[c.status]}>{r.statuses[c.status]}</Badge>
                    </TableCell>
                    <TableCell label={r.approved}>{c.approvedAt ? utcDate(c.approvedAt, locale) : t.dash}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {commissions.ok ? (
        <Pagination total={commissions.data.total} pageSize={PAGE_SIZE} page={page} basePath={base} searchParams={filters} />
      ) : null}
    </div>
  );
}
