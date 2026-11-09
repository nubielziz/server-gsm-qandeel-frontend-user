// ServiceCard: one service of the catalog (mockup "Featured Products", adapted to what the API has: no stock, no cart, no
// favourites, no order counts). The whole card opens the service page (stretched title link); "Order now" goes straight to
// checkout. Heights are fixed by design (2-line title, 2-line summary, one row of chips) so a skeleton has the same size.
import Link from "next/link";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { countryName } from "@/lib/countries";
import { fmt } from "@/lib/i18n/define";
import { localePath, type Locale } from "@/lib/i18n/config";
import type { ServiceType, StoreServiceCard } from "@/lib/api/types";
import { BdiText } from "./bdi-text";
import { BrandLogo, ServiceArt } from "./service-art";

export type ServiceCardLabels = {
  /** "Order now" */
  orderNow: string;
  /** "Delivery: {time}" */
  delivery: string;
  /** "Order {title}" (accessible name of the order link) */
  orderService: string;
  /** Service type names (`common.serviceType`). */
  types: Record<ServiceType, string>;
};

export type ServiceCardProps = {
  service: StoreServiceCard;
  locale: Locale;
  /** Display decimals of the visitor's currency (`getCurrency().decimals`). */
  decimals: number;
  labels: ServiceCardLabels;
  /** Marks the card art as the page's main image (preload). At most one per page. */
  priority?: boolean;
};

const CARD_SIZES = "(min-width: 1280px) 25vw, (min-width: 640px) 33vw, 100vw";

export function ServiceCard({ service, locale, decimals, labels, priority }: ServiceCardProps) {
  const href = localePath(locale, `/services/${encodeURIComponent(service.slug)}`);
  const orderHref = `${localePath(locale, "/checkout")}?service=${encodeURIComponent(service.slug)}`;
  const chips = [service.brand, service.network, service.country ? countryName(service.country, locale) : ""].filter(Boolean);
  return (
    <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition-[border-color,box-shadow] duration-(--duration-fast) ease-standard hover:border-control hover:shadow-raised has-[.card-link:focus-visible]:outline-2 has-[.card-link:focus-visible]:outline-offset-2 has-[.card-link:focus-visible]:outline-focus">
      <div className="relative">
        <ServiceArt type={service.type} sizes={CARD_SIZES} priority={priority} />
        <Badge tone="outline" shape="tag" className="absolute start-3 top-3">
          {labels.types[service.type]}
        </Badge>
        {service.brand ? (
          <span className="absolute end-3 top-3 empty:hidden">
            <BrandLogo brand={service.brand} />
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="min-h-[2lh] text-subheading text-ink">
          <Link href={href} className="card-link line-clamp-2 rounded-badge after:absolute after:inset-0 focus-visible:outline-none">
            {service.title}
          </Link>
        </h3>
        {service.summary ? <p className="line-clamp-2 min-h-[2lh] text-small text-ink-muted">{service.summary}</p> : null}
        {chips.length > 0 ? (
          <ul className="flex h-6 flex-wrap gap-1.5 overflow-hidden" aria-label={chips.join(", ")}>
            {chips.map((chip) => (
              <li key={chip}>
                <Badge tone="outline" shape="tag" className="max-w-40 truncate">
                  {chip}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-3">
          <div className="min-w-0">
            <Money
              amount={service.price.gross}
              currency={service.price.currency}
              locale={locale}
              decimals={decimals}
              className="text-heading font-bold text-ink"
            />
            <p className="mt-0.5 flex items-center gap-1 text-small text-ink-subtle">
              <Clock aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">
                <BdiText template={labels.delivery} value={service.deliveryTime} />
              </span>
            </p>
          </div>
          <ButtonLink
            href={orderHref}
            size="sm"
            className="relative z-10"
            aria-label={fmt(labels.orderService, { title: service.title })}
          >
            {labels.orderNow}
          </ButtonLink>
        </div>
      </div>
    </article>
  );
}

/** The same box as ServiceCard (art, 2-line title, 2-line summary, chips row, price row) while the catalog loads. */
export function ServiceCardSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <Skeleton className="aspect-[16/10] h-auto rounded-none" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-h-[2lh] text-subheading">
          <Skeleton className="h-[1lh] w-4/5" />
        </div>
        <div className="min-h-[2lh] text-small">
          <Skeleton className="h-[1lh] w-full" />
        </div>
        <div className="flex h-6 gap-1.5">
          <Skeleton className="h-6 w-16 rounded-badge" />
          <Skeleton className="h-6 w-20 rounded-badge" />
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-3">
          <div className="min-w-0">
            <div className="text-heading">
              <Skeleton className="h-[1lh] w-20" />
            </div>
            <div className="mt-0.5 text-small">
              <Skeleton className="h-[1lh] w-28" />
            </div>
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
    </div>
  );
}

/** A grid of skeleton cards for Suspense fallbacks. */
export function ServiceGridSkeleton({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <div className={className ?? "grid gap-4 sm:grid-cols-2 xl:grid-cols-4"}>
      {Array.from({ length: count }, (_, i) => (
        <ServiceCardSkeleton key={i} />
      ))}
    </div>
  );
}
