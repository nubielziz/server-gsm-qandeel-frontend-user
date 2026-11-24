// One service with the account's price and the order form (handoff §4.4–4.5). A page of the one account area for the
// merchant rank: any other rank is sent to the account home before anything is read (`requireRank`). The service and the
// wallet are personal data (prices differ per account), so everything below the static skeleton streams behind <Suspense>.
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/container";
import { OrderForm } from "@/components/merchant/order-form";
import { PageError } from "@/components/merchant/page-error";
import { TypeBadge } from "@/components/merchant/type-badge";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { readAccountWallet } from "@/lib/account/wallet-read";
import { apiSessionGet } from "@/lib/api/server";
import { requireRank } from "@/lib/api/session";
import type { MerchantServiceDetail } from "@/lib/api/types";
import { formatNumber } from "@/lib/format";
import { sitePath } from "@/lib/site-path";
import { fmt } from "@/lib/i18n/define";
import { common, type CommonMessages } from "@/lib/i18n/messages/common";
import { merchant, type MerchantMessages } from "@/lib/i18n/messages/merchant";
import { formatMinutes } from "@/lib/merchant/format";
import { settle } from "@/lib/merchant/load";
import { orderFormHrefs } from "@/lib/merchant/order-input";
import { fromMerchantRule, quantityRuleText } from "@/lib/quantity";
import { PageTransition } from "@/components/layout/page-transition";

const ID_PATTERN = /^[1-9]\d{0,15}$/;

export function generateMetadata(): Metadata {
  const t = merchant;
  return { title: t.catalog.title };
}

export default function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageTransition>
      <Suspense fallback={<ServiceSkeleton />}>
        <Service params={params} />
      </Suspense>
    </PageTransition>
  );
}

function ServiceSkeleton() {
  return (
    <div className="grid gap-6" aria-hidden="true">
      <Skeleton className="h-5 w-56" />
      <Skeleton className="h-[5.5rem] rounded-card" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="grid gap-6">
          <Skeleton className="h-64 rounded-card" />
          <Skeleton className="h-72 rounded-card" />
        </div>
        <Skeleton className="h-96 rounded-card" />
      </div>
    </div>
  );
}

async function Service({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = merchant;
  const c = common;
  if (!ID_PATTERN.test(id)) notFound();
  const here = sitePath(`/account/services/${id}`);
  // The order form is the merchant rank's: a retail account goes to the account home, a visitor to sign-in, and no read is made.
  await requireRank("merchant", here);

  // The wallet is the request's one shared read (the header's balance reads the same one).
  const [service, wallet] = await Promise.all([
    settle(apiSessionGet<MerchantServiceDetail>(`${FAMILY_ROUTES.client.services}/${id}`)),
    readAccountWallet(),
  ]);
  if (!service.ok) return <PageError error={service.error} next={here} notFoundOn404 title={t.catalog.title} />;
  const s = service.data;
  const available = wallet?.kind === "merchant" && wallet.read.ok ? wallet.read.data.available : null;

  return (
    <div className="grid gap-6">
      <Breadcrumbs
        label={c.workspace.breadcrumbLabel}
        items={[{ label: t.service.breadcrumb, href: sitePath("/account/services") }, { label: s.name }]}
      />
      <PageHeader
        variant="card"
        title={s.name}
        description={
          <>
            <bdi dir="ltr">{s.code}</bdi> · {s.category.name}
          </>
        }
        actions={<TypeBadge type={s.type} t={c} />}
      />
      <OrderForm
        service={{
          id: s.id,
          name: s.name,
          type: s.type,
          price: s.price,
          currency: s.currency,
          minQty: s.minQty,
          maxQty: s.maxQty,
          qtyOptions: s.qtyOptions,
          fields: s.fields,
        }}
        available={available}
        hrefs={orderFormHrefs()}
        labels={{ form: t.form, summary: t.summary, errors: t.orderErrors, placed: t.placed, quantity: c.quantity }}
        intro={<AboutCard service={s} t={t} c={c} />}
      />
    </div>
  );
}

const OPTION_LISTS = ["model", "network", "mep"] as const;
const OPTION_PREVIEW = 12;

function AboutCard({ service: s, t, c }: { service: MerchantServiceDetail; t: MerchantMessages; c: CommonMessages }) {
  const lists = OPTION_LISTS.map((list) => ({ list, items: s.options.filter((o) => o.list === list) })).filter((l) => l.items.length > 0);
  const term = "text-small font-semibold text-ink-muted";
  return (
    <Card as="section" aria-label={t.service.about}>
      <CardBody className="grid gap-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
          <div>
            <dt className={term}>{t.service.yourPrice}</dt>
            <dd className="mt-0.5">
              <span className="num text-heading">
                <Money amount={s.price} currency={s.currency} />
              </span>{" "}
              <span className="text-small text-ink-subtle">{t.service.perUnit}</span>
            </dd>
          </div>
          <div>
            <dt className={term}>{t.service.delivery}</dt>
            <dd className="mt-0.5 text-body font-semibold text-ink">{s.slaMinutes > 0 ? formatMinutes(s.slaMinutes) : s.deliveryTime || t.shared.dash}</dd>
          </div>
          <div>
            <dt className={term}>{t.service.type}</dt>
            <dd className="mt-0.5 text-body font-semibold text-ink">{(c.serviceType as Record<string, string>)[s.type] ?? s.type}</dd>
          </div>
          <div>
            <dt className={term}>{t.service.quantity}</dt>
            <dd className="mt-0.5 text-body font-semibold text-ink">
              <bdi>{quantityRuleText(fromMerchantRule(s), c.quantity)}</bdi>
            </dd>
          </div>
        </dl>
        {s.info.trim() ? (
          <div>
            <h3 className="text-subheading text-ink">{t.service.info}</h3>
            <p className="mt-1 whitespace-pre-line text-body text-ink-muted" dir="auto">
              {s.info}
            </p>
          </div>
        ) : null}
        {lists.length > 0 ? (
          <div className="grid gap-3 rounded-card bg-surface-muted p-4">
            <div>
              <h3 className="text-subheading text-ink">{t.service.options.title}</h3>
              <p className="text-small text-ink-subtle">{t.service.options.note}</p>
            </div>
            {lists.map(({ list, items }) => (
              <div key={list}>
                <p className="text-small font-semibold text-ink">{t.service.options[list]}</p>
                <p className="text-small text-ink-muted" dir="auto">
                  {items
                    .slice(0, OPTION_PREVIEW)
                    .map((o) => o.label || o.value)
                    .join(" · ")}
                  {items.length > OPTION_PREVIEW ? ` · ${fmt(t.service.options.more, { count: formatNumber(items.length - OPTION_PREVIEW) })}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
