// The overview of a retail account: the profile (edited in the settings; only the email is changed by support), a summary of
// the preferences, the five latest orders and quick links. The orders are read here, at request time; the page streams this
// component behind <Suspense> with a same-size skeleton. Server component.
import Link from "next/link";
import { ChevronRight, ClipboardList, CircleHelp, PackageSearch, Store } from "lucide-react";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { apiSessionList } from "@/lib/api/server";
import { listQuery } from "@/lib/api/query";
import type { AccountMe, CustomerOrder } from "@/lib/api/types";
import { countryName } from "@/lib/countries";
import { formatDate, formatNumber } from "@/lib/format";
import { sitePath } from "@/lib/site-path";
import { fmt } from "@/lib/i18n/define";
import { account } from "@/lib/i18n/messages/account";
import { settle } from "@/lib/merchant/load";
import { OrdersTable } from "@/components/account/orders-table";
import { PageError } from "@/components/merchant/page-error";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { EmptyState } from "@/components/ui/empty-state";
import { OverviewHeader } from "./overview-header";

/** How many of the latest orders the overview lists. */
export const OVERVIEW_ORDERS = 5;

export async function RetailOverview({ me }: { me: AccountMe }) {
  const read = await settle(
    apiSessionList<CustomerOrder>(FAMILY_ROUTES.store.orders, { query: listQuery({ start: 0, end: OVERVIEW_ORDERS }) }),
  );
  const t = account;
  const o = t.overview;
  const p = (path: string) => sitePath(path);
  const quick = [
    { href: p("/services"), label: o.quick.browse, icon: <Store aria-hidden="true" /> },
    { href: p("/track"), label: o.quick.track, icon: <PackageSearch aria-hidden="true" /> },
    { href: p("/help"), label: o.quick.help, icon: <CircleHelp aria-hidden="true" /> },
  ];

  return (
    <div className="grid gap-4">
      <OverviewHeader me={me} description={o.subtitle} actions={<ButtonLink href={p("/services")}>{o.browse}</ButtonLink>} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {read.ok ? (
          <Card as="section" aria-labelledby="recent-orders" className="self-start">
            <CardHeader
              title={<span id="recent-orders">{o.recent.title}</span>}
              description={read.data.total > 0 ? fmt(o.recent.total, { count: formatNumber(read.data.total) }) : undefined}
              actions={
                read.data.total > 0 ? (
                  <ButtonLink href={p("/account/orders")} variant="secondary" size="sm">
                    {o.recent.viewAll}
                  </ButtonLink>
                ) : undefined
              }
            />
            <CardBody flush>
              {read.data.data.length === 0 ? (
                <EmptyState
                  icon={<ClipboardList aria-hidden="true" />}
                  title={o.recent.emptyTitle}
                  description={o.recent.emptyText}
                  action={<ButtonLink href={p("/services")}>{o.browse}</ButtonLink>}
                />
              ) : (
                <OrdersTable orders={read.data.data} compact />
              )}
            </CardBody>
          </Card>
        ) : (
          <div className="self-start">
            <PageError error={read.error} next={p("/account")} />
          </div>
        )}

        <div className="grid content-start gap-4">
          <Card as="section" aria-labelledby="profile">
            <CardHeader titleAs="h2" title={<span id="profile">{o.profile.title}</span>} />
            <CardBody className="pt-2">
              <DescriptionList>
                <DescriptionItem label={o.profile.name}>
                  {me.name || <span className="text-ink-subtle">{o.profile.notProvided}</span>}
                </DescriptionItem>
                <DescriptionItem label={o.profile.email}>
                  <span className="flex flex-col items-end gap-1">
                    <span dir="ltr" className="break-all">
                      {me.email}
                    </span>
                    <Badge tone={me.emailVerifiedAt ? "success" : "warning"}>
                      {me.emailVerifiedAt ? o.profile.verified : o.profile.notVerified}
                    </Badge>
                  </span>
                </DescriptionItem>
                <DescriptionItem label={o.profile.phone}>
                  {me.phone ? (
                    <span dir="ltr">{me.phone}</span>
                  ) : (
                    <span className="text-ink-subtle">{o.profile.notProvided}</span>
                  )}
                </DescriptionItem>
                <DescriptionItem label={o.profile.country}>
                  {me.country ? countryName(me.country) : <span className="text-ink-subtle">{o.profile.notProvided}</span>}
                </DescriptionItem>
                <DescriptionItem label={o.profile.memberSince}>
                  {formatDate(me.createdAt, { month: "long", year: "numeric" })}
                </DescriptionItem>
              </DescriptionList>
            </CardBody>
            <CardFooter className="flex-col items-stretch sm:flex-col">
              <ButtonLink href={`${p("/account/settings")}#profile`} variant="secondary" size="sm">
                {o.profile.edit}
              </ButtonLink>
              <p className="text-small text-ink-subtle">{t.settings.profile.emailNote}</p>
              <ButtonLink href={p("/support")} variant="secondary" size="sm">
                {o.profile.contact}
              </ButtonLink>
            </CardFooter>
          </Card>

          <Card as="section" aria-labelledby="preferences">
            <CardHeader titleAs="h2" title={<span id="preferences">{o.preferences.title}</span>} />
            <CardBody className="pt-2">
              <DescriptionList>
                <DescriptionItem label={o.preferences.currency}>{me.currency ?? o.preferences.currencyDefault}</DescriptionItem>
                <DescriptionItem label={o.preferences.marketing}>
                  {me.marketingOptIn ? o.preferences.on : o.preferences.off}
                </DescriptionItem>
              </DescriptionList>
              <ButtonLink href={p("/account/settings")} variant="secondary" size="sm" className="mt-3">
                {o.preferences.change}
              </ButtonLink>
            </CardBody>
          </Card>

          <Card as="section" aria-labelledby="quick-links">
            <CardHeader titleAs="h2" title={<span id="quick-links">{o.quick.title}</span>} />
            <CardBody className="pt-2">
              <ul className="-mx-2">
                {quick.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="flex min-h-12 items-center gap-3 rounded-control px-2 text-body font-medium text-ink transition-colors hover:bg-surface-muted [&_svg]:size-5 [&_svg]:text-ink-muted"
                    >
                      {link.icon}
                      <span className="flex-1">{link.label}</span>
                      <ChevronRight aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
