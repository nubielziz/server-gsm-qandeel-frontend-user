// Pieces of the service page: FAQ accordion, the purchase card's rules and the merchant price hint.
import { cookies } from "next/headers";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Money } from "@/components/ui/money";
import { Markdown } from "@/components/ui/markdown";
import { demoteHeadings } from "./markdown-source";
import { getStoreService } from "@/lib/api/public";
import { apiSessionGet } from "@/lib/api/server";
import { MERCHANT_CSRF_COOKIE } from "@/lib/api/session";
import type { MerchantMe, MerchantServiceDetail, StoreServiceDetail } from "@/lib/api/types";
import { getCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { localePath, type Locale } from "@/lib/i18n/config";
import type { StoreMessages } from "@/lib/i18n/messages/store";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { store } from "@/lib/i18n/messages/store";

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

/** "1 per order", "1 to 10 per order" or "Packs of 10, 50, 100", from the service's quantity rule. */
export function quantityText(quantity: StoreServiceDetail["quantity"], locale: Locale, t: StoreMessages["service"]): string {
  const n = (value: number) => formatNumber(value, locale);
  if (quantity.options.length > 0) return fmt(t.quantityOptions, { options: quantity.options.map(n).join(", ") });
  if (quantity.min === quantity.max) return quantity.min === 1 ? t.quantityFixed : fmt(t.quantityExact, { count: n(quantity.min) });
  return fmt(t.quantityRange, { min: n(quantity.min), max: n(quantity.max) });
}

/** The service price in the visitor's currency (cookie): streams in behind a skeleton of the same size. */
export async function ServicePrice({ slug }: { slug: string }) {
  const [locale, currency] = await Promise.all([getLocale(), getCurrency()]);
  const service = await getStoreService(slug, { locale, currency: currency.code });
  if (!service) return null;
  return <Money amount={service.price.gross} currency={service.price.currency} locale={locale} decimals={currency.decimals} />;
}

/**
 * For a signed-in ACTIVE merchant only: what the merchant pays for this service (`GET /client/services/:id`), with a link
 * to the portal. Nothing for visitors, pending merchants or services the merchant cannot see (403/404). Reading it records
 * the merchant's listed price, which is intended (handoff §4.4).
 */
export async function MerchantPriceHint({ serviceId }: { serviceId: number }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages(store)]);
  const jar = await cookies();
  if (!jar.has(MERCHANT_CSRF_COOKIE)) return null;
  let service: MerchantServiceDetail | null = null;
  try {
    const me = await apiSessionGet<MerchantMe>("/client/auth/me");
    if (me.status === "active") service = await apiSessionGet<MerchantServiceDetail>(`/client/services/${serviceId}`);
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
