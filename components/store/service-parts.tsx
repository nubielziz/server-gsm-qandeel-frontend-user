// Pieces of the service page and the quick view: FAQ accordion, the price block (unit price, "per unit", "From", the
// packs), the facts rows (availability, delivery, quantity) and the merchant price hint.
// The price (currency cookie) and the merchant hint (session) await `navigation()` first: they render on the click, never
// in a prefetch, so every cookie read of the service page sits below it and a prefetch of a prerendered slug is served
// from the static output (plan P3.2; Next docs "Optimizing prefetching", "Keep the prefetch static"). Each sits in its
// own <Suspense>, whose fallback is what the prefetch shows.
import type { ReactNode } from "react";
import { navigation } from "next/cache";
import Link from "next/link";
import { ChevronDown, CircleCheck, Clock, Hash, PackageCheck, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { Markdown } from "@/components/ui/markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { demoteHeadings } from "./markdown-source";
import { priceNotes } from "./card-labels";
import { getStoreService } from "@/lib/api/public";
import { apiSessionGet } from "@/lib/api/server";
import { getMerchant } from "@/lib/api/session";
import type { MerchantServiceDetail, StoreServiceDetail } from "@/lib/api/types";
import { getCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { localePath, type Locale } from "@/lib/i18n/config";
import { common, type CommonMessages } from "@/lib/i18n/messages/common";
import type { StoreMessages } from "@/lib/i18n/messages/store";
import { getLocale, getMessages } from "@/lib/i18n/server";
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
export function serviceFacts(service: StoreServiceDetail, locale: Locale, t: StoreMessages, c: CommonMessages): ServiceFact[] {
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
  const delivery = deliveryLine(service, locale, c.delivery);
  if (delivery) facts.push({ key: "delivery", icon: Clock, label: c.delivery.label, value: <bdi>{delivery}</bdi> });
  facts.push({ key: "quantity", icon: Hash, label: t.service.quantity, value: <bdi>{quantityRuleText(service.quantity, c.quantity, locale)}</bdi> });
  return facts;
}

/**
 * "Instant delivery while stock lasts, otherwise within {time}": for an `in_stock` service sold as a range or packs
 * (the stock covers only the smallest order); null for every other service.
 */
export function serviceStockHint(service: StoreServiceDetail, locale: Locale, c: CommonMessages): string | null {
  return stockHint(service, locale, c.delivery);
}

/** Fills `{price}` of a sentence with a Money: it is laid out left-to-right, so the amount keeps its order inside Arabic text. */
function WithMoney({ template, amount, currency, locale, decimals }: { template: string; amount: string; currency: string; locale: Locale; decimals: number }) {
  const marker = "{price}";
  const at = template.indexOf(marker);
  if (at < 0) return template;
  return (
    <>
      {template.slice(0, at)}
      <Money amount={amount} currency={currency} locale={locale} decimals={decimals} />
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
  locale: Locale;
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
  const { rule, locale, q, t } = props;
  const pending = props.pending === true;
  const notes = priceNotes(pending ? "0.0000" : props.price.gross, rule);
  const count = (n: number) => formatNumber(n, locale);
  const money = (amount: string, template: string) =>
    props.pending ? null : <WithMoney template={template} amount={amount} currency={props.price.currency} locale={locale} decimals={props.decimals} />;
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 text-stat text-ink">
        {props.pending ? (
          <Skeleton className="h-[1lh] w-36" />
        ) : (
          <Money amount={props.price.gross} currency={props.price.currency} locale={locale} decimals={props.decimals} />
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
  const [locale, currency, t, c] = await Promise.all([getLocale(), getCurrency(), getMessages(store), getMessages(common)]);
  const service = await getStoreService(slug, { locale, currency: currency.code });
  if (!service) return null;
  return <PriceBlock price={service.price} decimals={currency.decimals} rule={service.quantity} locale={locale} q={c.quantity} t={t.service} />;
}

/**
 * For a signed-in ACTIVE merchant only: what the merchant pays for this service (`GET /client/services/:id`), with a link
 * to the portal. Nothing for visitors, pending merchants or services the merchant cannot see (403/404). Reading it records
 * the merchant's listed price, which is intended (handoff §4.4). Personal: rendered on the navigation, per request, never
 * cached or prefetched. The merchant comes from `getMerchant()` (no API call without the merchant's CSRF cookie, one per
 * request however many parts ask).
 */
export async function MerchantPriceHint({ serviceId }: { serviceId: number }) {
  await navigation();
  const [locale, t] = await Promise.all([getLocale(), getMessages(store)]);
  let service: MerchantServiceDetail | null = null;
  try {
    const me = await getMerchant();
    if (me?.status === "active") service = await apiSessionGet<MerchantServiceDetail>(`/client/services/${serviceId}`);
  } catch {
    // 401/403 (signed out, pending, not allowed) and 404 (service not on this merchant's list): no hint. Never break the page.
    service = null;
  }
  if (!service) return null;
  return (
    <div className="rounded-card border border-line bg-surface-muted p-4">
      <p className="text-small text-ink-muted">{t.service.merchantPrice}</p>
      <Money amount={service.price} currency={service.currency} locale={locale} decimals={2} className="text-heading font-bold text-ink" />
      <Link
        href={localePath(locale, `/merchant/services/${serviceId}`)}
        className="touch-target mt-1 flex text-small font-semibold text-ink underline underline-offset-4"
      >
        {t.service.merchantManage}
      </Link>
    </div>
  );
}
