// Pieces of the service page and the quick view: FAQ accordion, the public price (unit price, "per unit", "From", the packs:
// `PriceBlock`, ./price-block.tsx) and the facts rows (availability, delivery, quantity). An account of a merchant rank sees
// its own price in the same place, drawn by the personal price layer in the browser (./own-price.tsx, decision 003).
// The price (currency cookie) awaits `navigation()` first: it renders on the click, never in a prefetch, so every cookie
// read of the service page sits below it and a prefetch of a prerendered slug is served from the static output (plan P3.2;
// Next docs "Optimizing prefetching", "Keep the prefetch static"). It sits in its own <Suspense>, whose fallback is what the
// prefetch shows.
import type { ReactNode } from "react";
import { navigation } from "next/cache";
import Link from "next/link";
import { ChevronDown, CircleCheck, Clock, Hash, PackageCheck, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/ui/markdown";
import { demoteHeadings } from "./markdown-source";
import { PriceBlock } from "./price-block";
import { getStoreService } from "@/lib/api/public";
import type { StoreServiceDetail } from "@/lib/api/types";
import { getCurrency } from "@/lib/currency";
import { common, type CommonMessages } from "@/lib/i18n/messages/common";
import type { StoreMessages } from "@/lib/i18n/messages/store";
import { store } from "@/lib/i18n/messages/store";
import { deliveryLine, stockHint } from "@/lib/store/delivery";
import { quantityRuleText } from "@/lib/quantity";

export { PriceBlock, type PriceBlockProps } from "./price-block";

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
