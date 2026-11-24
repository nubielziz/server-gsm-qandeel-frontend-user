// ServiceCard: one service of the catalog (mockup "Featured Products", adapted to what the API has: no stock number, no
// cart, no favourites, no order counts). Both sizes follow one layout (the owner's card design "A", 2026-11-24): an identity
// row (the picture or brand logo, the brand and the service type, the quick view eye), a two-line title, the facts as pills
// (delivery time, carrier and country on the big card, "In stock"), then under a thin rule the price and the order link.
// The whole card opens the service page (stretched title link); the eye button opens the quick view; the order link goes
// straight to checkout. The title always keeps room for two lines, so the pills of a row line up; the pills wrap; the
// footer sits at the bottom of the card, so the cards of a row (stretched to one height by their grid) end on one line.
// A skeleton has the same rows. The delivery time is the staff note or the minutes (lib/store/delivery.ts).
// ServiceCardMini is the dense variant for side lists and the home list (mockup "New Arrivals", "All Products"). It is a
// size container (`@container`): below 15rem of content (two cards side by side on a phone, the best sellers panel) its
// title and price are smaller and the order link is the cart alone; wider, they grow and the link says "Order now". Below 9rem
// (two cards side by side on a phone) the quick view eye is left out so the brand keeps its room.
// In a browsable list (`index` given) the first PREFETCH_CARDS title links and quick view links use `prefetch={true}`:
// their prefetch carries the service page's or the quick view's content (static output for a prerendered slug; the price
// waits for the navigation), so the page or the dialog's title shows at once on a tap. The others keep the default
// prefetch of the route's shell, which leaves out the slug's content: a per-link prefetch for every card of a long grid
// would cost one request each (plan P3.2, P3.3, Next docs "Optimizing prefetching", "Trade-offs").
// The price and the order link sit in slots of the personal price layer (./own-price.tsx, decision 003): an account of a
// merchant rank sees its own price there, and an order link that is off for a service it may not buy.
import Link from "next/link";
import type { ReactNode } from "react";
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
import { sitePath } from "@/lib/site-path";
import { deliveryTime } from "@/lib/store/delivery";
import type { ServiceType, StoreServiceCard } from "@/lib/api/types";
import { BdiText } from "./bdi-text";
import { OwnBuy, OwnPrice } from "./own-price";
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

/**
 * The box of both card sizes. On hover it rises 2px with a softer, larger shadow and its picture grows a little inside
 * its frame (`group/card`, service-art.tsx); while it is up, a 2px strip under it still counts as the card, so the
 * pointer at its bottom edge does not make it bob. It shows the focus ring of its stretched title link.
 */
const frame =
  "group group/card relative flex min-w-0 flex-col rounded-card border border-line bg-surface shadow-card " +
  "transition-[translate,border-color,box-shadow] duration-(--duration-base) ease-standard " +
  "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift " +
  "hover:before:absolute hover:before:inset-x-0 hover:before:top-full hover:before:h-0.5 " +
  "has-[.card-link:focus-visible]:outline-2 has-[.card-link:focus-visible]:outline-offset-2 has-[.card-link:focus-visible]:outline-focus";

const links = (service: StoreServiceCard) => ({
  href: sitePath(`/services/${encodeURIComponent(service.slug)}`),
  orderHref: `${sitePath("/checkout")}?service=${encodeURIComponent(service.slug)}`,
});

/**
 * The quick view link: opens the service in a dialog over the current page (an intercepted route, see
 * app/en/(store)/@modal); opened directly it is the service page. Keeps the scroll position. The first cards of a
 * list prefetch the dialog's title, body and actions like their title link (`cardPrefetch`, plan P3.3).
 */
function QuickViewLink({
  service,
  labels,
  index,
  className,
}: Pick<ServiceCardProps, "service" | "labels" | "index"> & { className?: string }) {
  return (
    <IconButtonLink
      href={sitePath(`/quick-view/${encodeURIComponent(service.slug)}`)}
      label={fmt(labels.quickView, { title: service.title })}
      variant="quiet"
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
 * The bottom of a card: pushed to the bottom of the card (the cards of a row end on one line), a thin rule, then the price
 * and the order link. `md` for ServiceCard, `sm` for ServiceCardMini and the skeletons of each.
 */
function CardFooter({ size, children }: { size: "md" | "sm"; children: ReactNode }) {
  return (
    <div className={cn("mt-auto", size === "md" ? "pt-5" : "pt-4")}>
      <div className={cn("flex items-center justify-between gap-3 border-t border-line", size === "md" ? "pt-4" : "pt-3")}>
        {children}
      </div>
    </div>
  );
}

/**
 * The delivery time as the text of its pill: the staff note as written, else the minutes. Screen readers hear the whole
 * sentence ("Delivery: 2 days"); a long note is cut with an ellipsis.
 */
function Delivery({ time, labels }: { time: string; labels: ServiceCardLabels }) {
  return (
    <>
      <VisuallyHidden>
        <BdiText template={labels.delivery} value={time} />
      </VisuallyHidden>
      <bdi aria-hidden="true" className="min-w-0 truncate">
        {time}
      </bdi>
    </>
  );
}

/**
 * The facts of a service as pills, in this order: the delivery time (clock), the carrier and country (`place`, the big card
 * only) and "In stock" (`in_stock` services only: an `on_request` service says its delivery time instead). Nothing when
 * there is none. In a narrow card the pills wrap onto a second line; a long text is cut inside its pill.
 */
function Facts({
  service,
  labels,
  time,
  place,
  className,
}: Pick<ServiceCardProps, "service" | "labels"> & { time: string; place?: string; className?: string }) {
  const stocked = service.availability === "in_stock";
  if (!time && !place && !stocked) return null;
  return (
    <ul className={cn("flex min-w-0 flex-wrap gap-1.5", className)}>
      {time ? (
        <li className="flex min-w-0 max-w-full">
          <Badge icon={<Clock aria-hidden="true" />} className="max-w-full">
            <Delivery time={time} labels={labels} />
          </Badge>
        </li>
      ) : null}
      {place ? (
        <li className="flex min-w-0 max-w-full">
          <Badge icon={<MapPin aria-hidden="true" />} className="max-w-full">
            <span className="min-w-0 truncate">{place}</span>
          </Badge>
        </li>
      ) : null}
      {stocked ? (
        <li className="flex">
          <Badge tone="success" icon={<CircleCheck aria-hidden="true" />}>
            {labels.inStock}
          </Badge>
        </li>
      ) : null}
    </ul>
  );
}

export function ServiceCard({ service, decimals, labels, priority, index }: ServiceCardProps) {
  const { href, orderHref } = links(service);
  const place = [service.network, service.country ? countryName(service.country) : ""].filter(Boolean).join(" · ");
  const time = deliveryTime(service).text;
  return (
    <article className={cn(frame, "p-5")}>
      <div className="flex h-12 items-center gap-3">
        <ServiceMark
          type={service.type}
          imageUrl={service.imageUrl}
          brand={service.brand}
          caption={labels.types[service.type]}
          priority={priority}
        />
        <QuickViewLink service={service} labels={labels} index={index} className="-me-2 self-start" />
      </div>
      <h3 className="mt-4 min-h-[2lh] text-subheading font-bold text-ink">
        <Link
          href={href}
          prefetch={cardPrefetch(index)}
          className="card-link line-clamp-2 rounded-badge after:absolute after:inset-0 focus-visible:outline-none"
        >
          {service.title}
        </Link>
      </h3>
      {service.summary ? <p className="mt-1 line-clamp-1 text-small text-ink-muted">{service.summary}</p> : null}
      <Facts service={service} labels={labels} time={time} place={place} className="mt-3" />
      <CardFooter size="md">
        <OwnPrice serviceId={service.id} className="min-w-0 text-heading font-bold text-ink" placeholderClassName="w-20">
          <Money
            amount={service.price.gross}
            currency={service.price.currency}
            decimals={decimals}
            className="min-w-0 text-heading font-bold text-ink"
          />
        </OwnPrice>
        <OwnBuy serviceId={service.id}>
          <ButtonLink
            href={orderHref}
            size="sm"
            className="relative z-10"
            startIcon={<ShoppingCart aria-hidden="true" />}
            aria-label={fmt(labels.orderService, { title: service.title })}
          >
            {labels.orderNow}
          </ButtonLink>
        </OwnBuy>
      </CardFooter>
    </article>
  );
}

/** Two pills of the facts row while the catalog loads (the height of a Badge). */
const PILL_SKELETON = "h-[1.375rem] rounded-full";

/** The same box as ServiceCard (identity row, title, pills, footer) while the catalog loads. */
export function ServiceCardSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="flex h-12 items-center gap-3">
        <Skeleton className="size-12 shrink-0" />
        <div className="grid gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="mt-4 min-h-[2lh] text-subheading">
        <Skeleton className="h-[1lh] w-4/5" />
      </div>
      <div className="mt-3 flex gap-1.5">
        <Skeleton className={cn(PILL_SKELETON, "w-20")} />
        <Skeleton className={cn(PILL_SKELETON, "w-24")} />
      </div>
      <CardFooter size="md">
        <div className="text-heading">
          <Skeleton className="h-[1lh] w-20" />
        </div>
        <Skeleton className="h-10 w-32" />
      </CardFooter>
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

/** The dense card's title: 13px in a narrow card, 15px from 15rem of content up; always room for two lines. */
const MINI_TITLE = "min-h-[2lh] text-small font-semibold leading-snug text-ink @min-[15rem]:text-body";

/** The dense card's price: 15px in a narrow card, 20px from 15rem of content up. */
const MINI_PRICE = "min-w-0 text-body font-bold text-ink @min-[15rem]:text-heading";

/**
 * The dense card: the identity row (picture, brand, type, quick view), a 2-line title, the delivery time and "In stock" as
 * pills, the price and the order link (the cart alone in a narrow card, "Order now" from 15rem of content up).
 */
export function ServiceCardMini({ service, decimals, labels, index }: Omit<ServiceCardProps, "priority">) {
  const { href, orderHref } = links(service);
  const time = deliveryTime(service).text;
  return (
    <article className={cn(frame, "@container p-4")}>
      <div className="flex h-10 items-center gap-2">
        <ServiceMark
          type={service.type}
          imageUrl={service.imageUrl}
          brand={service.brand}
          caption={labels.types[service.type]}
          size="sm"
        />
        {/* Below 9rem of content (two cards side by side on a phone) the eye leaves the brand its room; a tap on the card opens the page. */}
        <QuickViewLink service={service} labels={labels} index={index} className="-me-2 -mt-1 self-start @max-[9rem]:hidden" />
      </div>
      <h3 className={cn("mt-3.5", MINI_TITLE)}>
        <Link
          href={href}
          prefetch={cardPrefetch(index)}
          className="card-link line-clamp-2 rounded-badge after:absolute after:inset-0 focus-visible:outline-none"
        >
          {service.title}
        </Link>
      </h3>
      <Facts service={service} labels={labels} time={time} className="mt-2.5" />
      <CardFooter size="sm">
        <OwnPrice serviceId={service.id} className={MINI_PRICE} placeholderClassName="w-14">
          <Money amount={service.price.gross} currency={service.price.currency} decimals={decimals} className={MINI_PRICE} />
        </OwnPrice>
        <OwnBuy serviceId={service.id}>
          <ButtonLink
            href={orderHref}
            size="sm"
            className="relative z-10"
            startIcon={<ShoppingCart aria-hidden="true" />}
            aria-label={fmt(labels.orderService, { title: service.title })}
          >
            <span className="hidden @min-[15rem]:inline">{labels.orderNow}</span>
          </ButtonLink>
        </OwnBuy>
      </CardFooter>
    </article>
  );
}

/** The same box as ServiceCardMini while the catalog loads. */
export function ServiceCardMiniSkeleton() {
  return (
    <div aria-hidden="true" className="@container flex min-w-0 flex-col rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex h-10 items-center gap-2.5">
        <Skeleton className="size-10 shrink-0" />
        <div className="grid gap-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
      <div className={cn("mt-3.5", MINI_TITLE)}>
        <Skeleton className="h-[1lh] w-4/5" />
      </div>
      <div className="mt-2.5 flex">
        <Skeleton className={cn(PILL_SKELETON, "w-16")} />
      </div>
      <CardFooter size="sm">
        <div className={MINI_PRICE}>
          <Skeleton className="h-[1lh] w-14" />
        </div>
        <Skeleton className="h-10 w-11 @min-[15rem]:w-28" />
      </CardFooter>
    </div>
  );
}
