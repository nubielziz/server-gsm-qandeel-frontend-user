// Pieces of the service page and the quick view: FAQ accordion, the price block (unit price, "per unit", "From", the
// packs), the facts rows (availability, delivery, quantity) and the price hint of a merchant rank.
// The price (currency cookie) and the rank hint (session) await `navigation()` first: they render on the click, never
// in a prefetch, so every cookie read of the service page sits below it and a prefetch of a prerendered slug is served
// from the static output (plan P3.2; Next docs "Optimizing prefetching", "Keep the prefetch static"). Each sits in its
// own <Suspense>, whose fallback is what the prefetch shows.
import type { ReactNode } from "react";
import { navigation } from "next/cache";
import Link from "next/link";
import { ChevronDown, CircleCheck, Clock, Hash, PackageCheck, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Markdown } from "@/components/ui/markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { demoteHeadings } from "./markdown-source";
import { priceNotes } from "./card-labels";
import { rankKindOf } from "@/lib/account/family";
import { getStoreService } from "@/lib/api/public";
import { apiSessionGet } from "@/lib/api/server";
import { getAccount } from "@/lib/api/session";
import type { MerchantServiceDetail, StoreServiceDetail } from "@/lib/api/types";
import { priceListHref } from "@/lib/checkout/access";
import { getCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { common, type CommonMessages } from "@/lib/i18n/messages/common";
import type { StoreMessages } from "@/lib/i18n/messages/store";
import { store } from "@/lib/i18n/messages/store";
import { deliveryLine, stockHint } from "@/lib/store/delivery";
import { quantityRuleText, type QuantityRule } from "@/lib/quantity";

/** Native `<details>` accordion: keyboard and screen-reader friendly without JavaScript. Used for service FAQs and help. */
export function Accordion({ items }: { items: { id: string | number; question: string; answerMd: string; href?: string; openLabel?: string }[] }) {
  return (
    <div className="divide-y divide-line rounded-card border border-line bg-surface shadow-card">
      {items.map((item) => (
        <details key={item.id} className="group px-5 sm:px-6">
          <summary className="flex min-h-14 list-none items-center justify-between gap-4 py-3 text-subheading text-ink marker:hidden [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">{item.question}</span>
            <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-ink-subtle transition-transform group-open:rotate-180" />
          </summary>
          <div className="pb-5">
            <Markdown source={demoteHeadings(item.answerMd)} />
            {item.href ? (
              <Link href={item.href} className="touch-target mt-3 inline-flex text-small font-semibold text-ink underline underline-offset-4">
                {item.openLabel}
              </Link>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
}

/** The facts rows of a service (the purchase card of the page, the quick view's list): what the caller shows as `dt`/`dd`. */
export type ServiceFact = { key: "availability" | "delivery" | "quantity"; icon: LucideIcon; label: string; value: ReactNode };

/**
 * Availability (the "In stock" badge, only for `in_stock`: an `on_request` service says its delivery line instead, and
 * no stock number exists), delivery (the staff note as written, else "Delivered within {time}" in the page's language;
 * no row without delivery information) and the quantity rule ("2 to 50 per order", "Packs of 5, 10, 25").
 */
export function serviceFacts(service: StoreServiceDetail, t: StoreMessages, c: CommonMessages): ServiceFact[] {
  const facts: ServiceFact[] = [];
  if (service.availability === "in_stock") {
    facts.push({
      key: "availability",
      icon: PackageCheck,
      label: t.service.availability,
      value: (
        <Badge tone="success" shape="tag" icon={<CircleCheck aria-hidden="true" />}>
          {c.availability.inStock}
        </Badge>
      ),
    });
  }
  const delivery = deliveryLine(service, c.delivery);
  if (delivery) facts.push({ key: "delivery", icon: Clock, label: c.delivery.label, value: <bdi>{delivery}</bdi> });
  facts.push({ key: "quantity", icon: Hash, label: t.service.quantity, value: <bdi>{quantityRuleText(service.quantity, c.quantity)}</bdi> });
  return facts;
}

/**
 * "Instant delivery while stock lasts, otherwise within {time}": for an `in_stock` service sold as a range or packs
 * (the stock covers only the smallest order); null for every other service.
 */
export function serviceStockHint(service: StoreServiceDetail, c: CommonMessages): string | null {
  return stockHint(service, c.delivery);
}

/** Fills `{price}` of a sentence with a Money: it is laid out left-to-right, so the amount keeps its order inside the sentence. */
function WithMoney({ template, amount, currency, decimals }: { template: string; amount: string; currency: string; decimals: number }) {
  const marker = "{price}";
  const at = template.indexOf(marker);
  if (at < 0) return template;
  return (
    <>
      {template.slice(0, at)}
      <Money amount={amount} currency={currency} decimals={decimals} />
      {template.slice(at + marker.length)}
    </>
  );
}

const NOTE_LINE = "text-body font-semibold text-ink";

/** One line of the price block: the text, or (while the price streams in) a skeleton bar of the same height. */
function PriceLine({ pending, width, className, children }: { pending: boolean; width: string; className: string; children?: ReactNode }) {
  if (!pending) return <p className={className}>{children}</p>;
  return (
    <div aria-hidden="true" className={className}>
      <Skeleton className={`h-[1lh] ${width}`} />
    </div>
  );
}

export type PriceBlockProps = {
  /** The quantity rule of the service: it decides which notes follow the price (`priceNotes`). */
  rule: QuantityRule;
  /** Strings: `common.quantity` and `store.service`. */
  q: CommonMessages["quantity"];
  t: StoreMessages["service"];
} & (
  | {
      /** The unit price in the shown currency and its display decimals. */
      price: { gross: string; currency: string };
      decimals: number;
      pending?: false;
    }
  | { price?: undefined; decimals?: undefined; pending: true }
);

/**
 * The price of one unit in the visitor's currency, with what a buyer needs to know when a purchase holds more than one
 * unit (BH §13, §14.3): "per unit" beside the price, "From {price × smallest quantity}" (packs, a range above 1),
 * "{N} for {price × N}" (exactly N), the packs with their estimates, and a note that the checkout shows the exact total.
 * One per order: the price alone. `pending` keeps the fixed texts (the packs title and the per-unit note) and draws only
 * the money lines as skeletons while the price streams in, so nothing moves.
 */
export function PriceBlock(props: PriceBlockProps) {
  const { rule, q, t } = props;
  const pending = props.pending === true;
  const notes = priceNotes(pending ? "0.0000" : props.price.gross, rule);
  const count = (n: number) => formatNumber(n);
  const money = (amount: string, template: string) =>
    props.pending ? null : <WithMoney template={template} amount={amount} currency={props.price.currency} decimals={props.decimals} />;
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 text-stat text-ink">
        {props.pending ? (
          <Skeleton className="h-[1lh] w-36" />
        ) : (
          <Money amount={props.price.gross} currency={props.price.currency} decimals={props.decimals} />
        )}
        {notes.perUnit && !pending ? <span className="text-small font-semibold tracking-normal text-ink-muted">{q.perUnit}</span> : null}
      </div>
      {notes.from !== null ? (
        <PriceLine pending={pending} width="w-28" className={NOTE_LINE}>
          {money(notes.from, q.from)}
        </PriceLine>
      ) : null}
      {notes.exact ? (
        <PriceLine pending={pending} width="w-32" className={NOTE_LINE}>
          {money(notes.exact.amount, fmt(q.exactFor, { count: count(notes.exact.count) }))}
        </PriceLine>
      ) : null}
      {notes.packs.length > 0 ? (
        <div className="mt-1 grid gap-1">
          <p className="text-small font-semibold text-ink-muted">{t.packsTitle}</p>
          {pending ? (
            <div aria-hidden="true" className="grid gap-0.5">
              {notes.packs.map((pack) => (
                <PriceLine key={pack.count} pending width="w-40" className="text-body" />
              ))}
            </div>
          ) : (
            <ul aria-label={t.packsTitle} className="grid gap-0.5 text-body text-ink">
              {notes.packs.map((pack) => (
                <li key={pack.count}>{money(pack.amount, fmt(q.packFor, { count: count(pack.count) }))}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {notes.perUnit ? <p className="text-small text-ink-subtle">{t.perUnitNote}</p> : null}
    </div>
  );
}

/**
 * The service price in the visitor's currency (cookie) with its notes: streams in behind `PriceBlock pending`, on the
 * navigation (never in a prefetch; a direct load is unaffected).
 */
export async function ServicePrice({ slug }: { slug: string }) {
  await navigation();
  const currency = await getCurrency();
  const t = store;
  const c = common;
  const service = await getStoreService(slug, { currency: currency.code });
  if (!service) return null;
  return <PriceBlock price={service.price} decimals={currency.decimals} rule={service.quantity} q={c.quantity} t={t.service} />;
}

/**
 * For a signed-in account of a merchant rank only: what the account pays for this service (`GET /client/services/:id`), a
 * button "Order at your price" to its price list, and the line that the shop checkout is for retail buyers. Nothing for
 * visitors, for retail ranks, or for a service the account cannot see (403/404). Reading it records the account's listed
 * price, which is intended. Personal: rendered on the navigation, per request, never cached or prefetched. The account
 * comes from `getAccount()` (no API call without the account's CSRF cookie, one per request however many parts ask); a retail
 * rank costs that one read and no service read.
 */
export async function RankPriceHint({ serviceId }: { serviceId: number }) {
  await navigation();
  const t = store;
  let service: MerchantServiceDetail | null = null;
  try {
    const me = await getAccount();
    if (me && rankKindOf(me) === "merchant") {
      service = await apiSessionGet<MerchantServiceDetail>(`/client/services/${serviceId}`);
    }
  } catch {
    // 401/403 (signed out, suspended, not allowed) and 404 (service not on this account's list): no hint. Never break the page.
    service = null;
  }
  if (!service) return null;
  return (
    <div className="grid gap-3 rounded-card border border-line bg-surface-muted p-4">
      <div>
        <p className="text-small text-ink-muted">{t.service.rankPrice}</p>
        <Money amount={service.price} currency={service.currency} decimals={2} className="text-heading font-bold text-ink" />
      </div>
      <ButtonLink href={priceListHref(serviceId)} block>
        {t.service.rankOrder}
      </ButtonLink>
      <p className="text-small text-ink-subtle">{t.service.rankRetailOnly}</p>
    </div>
  );
}
