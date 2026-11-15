// ServiceCard: one service of the catalog (mockup "Featured Products", adapted to what the API has: no stock number, no
// cart, no favourites, no order counts). The whole card opens the service page (stretched title link); the eye button
// opens the quick view (where the mockup has the favourite heart); "Order now" goes straight to checkout. Heights are
// fixed by design (art row, tag row, 2-line title + 1-line summary, meta row, price row) so a skeleton has the same
// size: the "In stock" badge shares the tag row (ServiceCard) or wraps under the delivery time in the two-line delivery
// row (ServiceCardMini, reserved for every card) and never changes their height. The delivery time is the staff note
// or the minutes in the page's language (lib/store/delivery.ts).
// ServiceCardMini is the dense variant for side lists and the home list (mockup "New Arrivals", "All Products").
// In a browsable list (`index` given) the first PREFETCH_CARDS title links and quick view links use `prefetch={true}`:
// their prefetch carries the service page's or the quick view's content (static output for a prerendered slug; the price
// waits for the navigation), so the page or the dialog's title shows at once on a tap. The others keep the default
// prefetch of the route's shell, which leaves out the slug's content: a per-link prefetch for every card of a long grid
// would cost one request each (plan P3.2, P3.3, Next docs "Optimizing prefetching", "Trade-offs").
import Link from "next/link";
import { CircleCheck, Clock, Eye, MapPin, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { IconButtonLink } from "@/components/ui/icon-button";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { cn } from "@/lib/cn";
import { countryName } from "@/lib/countries";
import { fmt } from "@/lib/i18n/define";
import { localePath, type Locale } from "@/lib/i18n/config";
import { deliveryTime } from "@/lib/store/delivery";
import type { ServiceType, StoreServiceCard } from "@/lib/api/types";
import { BdiText } from "./bdi-text";
import { ServiceMark } from "./service-art";

export type ServiceCardLabels = {
  /** "Order now" */
  orderNow: string;
  /** "Delivery: {time}" */
  delivery: string;
  /** "Order {title}" (accessible name of the order link) */
  orderService: string;
  /** "Quick view: {title}" (accessible name of the quick view link) */
  quickView: string;
  /** "In stock" (the badge of a service whose stock covers the smallest order; never a number). */
  inStock: string;
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
  /** The card's place in its list (0 first): the first PREFETCH_CARDS prefetch their page's and quick view's content. Left out: default prefetch. */
  index?: number;
};

/** How many cards of a list prefetch their service page's and quick view's content (`prefetch={true}` on both links). */
export const PREFETCH_CARDS = 4;

/** The title and quick view links' prefetch: the route's content for the first cards of a list, else Next's default (`"auto"`). */
export function cardPrefetch(index: number | undefined): true | "auto" {
  return index !== undefined && index < PREFETCH_CARDS ? true : "auto";
}

/** The box of both card sizes: lifts on hover and shows the focus ring of its stretched title link. */
const frame =
  "group relative flex min-w-0 flex-col rounded-card border border-line bg-surface shadow-card " +
  "transition-[border-color,box-shadow] duration-(--duration-base) ease-standard hover:border-line-strong hover:shadow-raised " +
  "has-[.card-link:focus-visible]:outline-2 has-[.card-link:focus-visible]:outline-offset-2 has-[.card-link:focus-visible]:outline-focus";

/**
 * Room for two title lines, one summary line and the meta row, in both languages (their line heights differ), wherever
 * cards stand side by side (`sm` up). A shorter title leaves the spare room above the price row. The skeleton reserves
 * the same.
 */
const BODY_BLOCK =
  "sm:min-h-[calc(2*var(--text-subheading)*var(--text-subheading--line-height)+var(--text-small)*var(--text-small--line-height)+2rem)]";

const links = (service: StoreServiceCard, locale: Locale) => ({
  href: localePath(locale, `/services/${encodeURIComponent(service.slug)}`),
  orderHref: `${localePath(locale, "/checkout")}?service=${encodeURIComponent(service.slug)}`,
});

/**
 * The quick view link: opens the service in a dialog over the current page (an intercepted route, see
 * app/[lang]/(store)/@modal); opened directly it is the service page. Keeps the scroll position. The first cards of a
 * list prefetch the dialog's title, body and actions like their title link (`cardPrefetch`, plan P3.3).
 */
function QuickViewLink({
  service,
  locale,
  labels,
  index,
  className,
}: Pick<ServiceCardProps, "service" | "locale" | "labels" | "index"> & { className?: string }) {
  return (
    <IconButtonLink
      href={localePath(locale, `/quick-view/${encodeURIComponent(service.slug)}`)}
      label={fmt(labels.quickView, { title: service.title })}
      size="sm"
      scroll={false}
      prefetch={cardPrefetch(index)}
      className={cn("z-10", className)}
    >
      <Eye aria-hidden="true" />
    </IconButtonLink>
  );
}

/**
 * The delivery time with a clock: the staff note as written, else the minutes in the page's language. Screen readers
 * hear the whole sentence ("Delivery: 2 days"). Nothing when the service has no delivery information.
 */
function Delivery({ time, labels }: { time: string; labels: ServiceCardLabels }) {
  if (!time) return null;
  return (
    <>
      <Clock aria-hidden="true" className="size-3.5 shrink-0" />
      <VisuallyHidden>
        <BdiText template={labels.delivery} value={time} />
      </VisuallyHidden>
      <bdi aria-hidden="true" className="truncate">
        {time}
      </bdi>
    </>
  );
}

/** The "In stock" mark: for `in_stock` services only (an `on_request` service says its delivery time instead). */
function InStock({ service, labels }: Pick<ServiceCardProps, "service" | "labels">) {
  if (service.availability !== "in_stock") return null;
  return (
    <Badge tone="success" shape="tag" caps icon={<CircleCheck aria-hidden="true" />} className="shrink-0">
      {labels.inStock}
    </Badge>
  );
}

export function ServiceCard({ service, locale, decimals, labels, priority, index }: ServiceCardProps) {
  const { href, orderHref } = links(service, locale);
  const place = [service.network, service.country ? countryName(service.country, locale) : ""].filter(Boolean).join(" · ");
  const time = deliveryTime(service, locale).text;
  return (
    <article className={cn(frame, "p-4")}>
      <div className="flex h-12 items-center gap-3">
        <ServiceMark type={service.type} imageUrl={service.imageUrl} brand={service.brand} priority={priority} />
        <QuickViewLink service={service} locale={locale} labels={labels} index={index} className="-me-2 self-start" />
      </div>
      <div className="mt-3.5 flex h-[1.375rem] items-center gap-2 overflow-hidden">
        <Badge shape="tag" caps>
          {labels.types[service.type]}
        </Badge>
        <InStock service={service} labels={labels} />
      </div>
      <div className={cn("mt-2", BODY_BLOCK)}>
        <h3 className="text-subheading font-bold text-ink">
          <Link
            href={href}
            prefetch={cardPrefetch(index)}
            className="card-link line-clamp-2 rounded-badge after:absolute after:inset-0 focus-visible:outline-none"
          >
            {service.title}
          </Link>
        </h3>
        {service.summary ? <p className="mt-0.5 line-clamp-1 text-small text-ink-muted">{service.summary}</p> : null}
        <ul className="mt-2.5 flex h-5 items-center gap-x-4 text-small text-ink-muted">
          {time ? (
            <li className="flex min-w-0 shrink-0 items-center gap-1.5">
              <Delivery time={time} labels={labels} />
            </li>
          ) : null}
          {place ? (
            <li className="flex min-w-0 items-center gap-1.5">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{place}</span>
            </li>
          ) : null}
        </ul>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-3">
        <Money
          amount={service.price.gross}
          currency={service.price.currency}
          locale={locale}
          decimals={decimals}
          className="min-w-0 text-heading font-bold text-ink"
        />
        <ButtonLink
          href={orderHref}
          size="sm"
          className="relative z-10"
          startIcon={<ShoppingCart aria-hidden="true" />}
          aria-label={fmt(labels.orderService, { title: service.title })}
        >
          {labels.orderNow}
        </ButtonLink>
      </div>
    </article>
  );
}

/** The same box as ServiceCard (art row, tag, title + summary, meta row, price row) while the catalog loads. */
export function ServiceCardSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex h-12 items-center gap-3">
        <Skeleton className="size-12 shrink-0" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="mt-3.5 flex h-[1.375rem] items-center">
        <Skeleton className="h-[1.375rem] w-24 rounded-badge" />
      </div>
      <div className={cn("mt-2", BODY_BLOCK)}>
        <div className="text-subheading">
          <Skeleton className="h-[1lh] w-4/5" />
        </div>
        <div className="mt-0.5 text-small">
          <Skeleton className="h-[1lh] w-3/5" />
        </div>
        <Skeleton className="mt-2.5 h-5 w-32" />
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-3">
        <div className="text-heading">
          <Skeleton className="h-[1lh] w-20" />
        </div>
        <Skeleton className="h-10 w-32" />
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

/**
 * The dense card: art, brand, a 2-line title, a 2-line summary, the delivery time (and the "In stock" mark), the price
 * and a square order link.
 */
export function ServiceCardMini({ service, locale, decimals, labels, index }: Omit<ServiceCardProps, "priority">) {
  const { href, orderHref } = links(service, locale);
  const time = deliveryTime(service, locale).text;
  return (
    <article className={cn(frame, "p-3.5")}>
      <div className="flex h-10 items-center gap-2.5">
        <ServiceMark type={service.type} imageUrl={service.imageUrl} brand={service.brand} size="sm" />
        <QuickViewLink service={service} locale={locale} labels={labels} index={index} className="-me-2 -mt-1 self-start" />
      </div>
      <h3 className="mt-3 text-small font-bold text-ink">
        <Link
          href={href}
          prefetch={cardPrefetch(index)}
          className="card-link line-clamp-2 rounded-badge after:absolute after:inset-0 focus-visible:outline-none"
        >
          {service.title}
        </Link>
      </h3>
      {service.summary ? <p className="mt-0.5 line-clamp-2 text-caption text-ink-muted">{service.summary}</p> : null}
      <div className="mt-2 flex h-12 flex-wrap content-start items-center gap-x-2 gap-y-1 overflow-hidden text-caption text-ink-subtle">
        <span className="flex h-[1.375rem] min-w-0 max-w-full items-center gap-1.5">
          <Delivery time={time} labels={labels} />
        </span>
        <InStock service={service} labels={labels} />
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <Money
          amount={service.price.gross}
          currency={service.price.currency}
          locale={locale}
          decimals={decimals}
          className="min-w-0 text-body font-bold text-ink"
        />
        <IconButtonLink
          href={orderHref}
          label={fmt(labels.orderService, { title: service.title })}
          variant="primary"
          size="sm"
          className="z-10"
        >
          <ShoppingCart aria-hidden="true" />
        </IconButtonLink>
      </div>
    </article>
  );
}

/** The same box as ServiceCardMini while the catalog loads. */
export function ServiceCardMiniSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-3.5 shadow-card">
      <Skeleton className="size-10" />
      <div className="mt-3 text-small">
        <Skeleton className="h-[1lh] w-4/5" />
      </div>
      <div className="mt-0.5 text-caption">
        <Skeleton className="h-[1lh] w-full" />
      </div>
      <div className="mt-2 flex h-12 items-start">
        <div className="flex h-[1.375rem] items-center">
          <Skeleton className="h-3.5 w-16" />
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <div className="text-body">
          <Skeleton className="h-[1lh] w-14" />
        </div>
        <Skeleton className="size-10" />
      </div>
    </div>
  );
}
