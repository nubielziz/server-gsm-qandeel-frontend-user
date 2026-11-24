// "Featured collections" of the home page: the brands, countries and carriers with the most services
// (lib/catalog-facets.ts), one card each. The brand tiles above already name the biggest groups, so a card shows what
// is inside: its best sellers with their delivery time and price (lib/catalog.ts `catalogCollections`). The head and
// the foot open the catalog filtered by the collection; each row opens its service page. The catalog has no
// categories (handoff §1.7), so these groups are what a collection can be.
// Prices (decision 003): each row's price is a slot of the personal price layer (./own-price.tsx), so an account of a merchant
// rank sees its own; a collection's "From" sums up services at their public prices and is left out for it (`RetailOnly`).
import Link from "next/link";
import { ArrowRight, Clock, Globe, Signal } from "lucide-react";
import { initialsOf } from "@/components/ui/avatar";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import type { StoreServiceCard } from "@/lib/api/types";
import type { FeaturedCollection } from "@/lib/catalog";
import type { Collection } from "@/lib/catalog-facets";
import { cn } from "@/lib/cn";
import { countryName } from "@/lib/countries";
import { fmt } from "@/lib/i18n/define";
import type { StoreMessages } from "@/lib/i18n/messages/store";
import { sitePath } from "@/lib/site-path";
import { deliveryTime } from "@/lib/store/delivery";
import { OwnPrice, RetailOnly } from "./own-price";
import { Logo, isSymbolLogo, logoFile } from "./service-art";

/** The grid: two collections share the row; with three the last one spans both columns until the row fits three. */
// Each card is a grid item with `min-w-0`: a long service name (one line, cut with an ellipsis) must not widen the column,
// or the whole page scrolls sideways on a phone.
const GRID = "grid gap-4 md:grid-cols-2";
const third = (i: number, total: number) => total === 3 && i === 2 && "md:max-lg:col-span-2";

/**
 * The card box: it rises 2px on hover like the service cards (service-card.tsx), and a 2px strip under it still counts
 * as the card while it is up, so the pointer at its bottom edge does not make it bob. No `overflow-hidden`: it would
 * clip that strip, so the foot rounds its own corners.
 */
const CARD =
  "relative flex h-full min-w-0 flex-col rounded-card border border-line bg-surface shadow-card " +
  "transition-[translate,border-color,box-shadow] duration-(--duration-base) ease-standard " +
  "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift " +
  "hover:before:absolute hover:before:inset-x-0 hover:before:top-full hover:before:h-0.5";

/** Paddings shared with the skeleton, so nothing moves when the cards arrive. */
const HEAD = "flex items-center gap-3 p-4 sm:px-5";
const LIST = "border-t border-line p-1.5 sm:px-2";
const ROW = "flex items-center gap-3 rounded-control px-2.5 py-2";
const FOOT = "mt-auto flex items-center justify-between gap-3 rounded-b-card border-t border-line px-4 py-3.5 sm:px-5";

export type CollectionCardsProps = {
  collections: FeaturedCollection[];
  /** Display decimals of the visitor's currency. */
  decimals: number;
  t: StoreMessages["home"]["collections"];
  /** "8 services" */
  countText: (count: number) => string;
};

export function CollectionCards({ collections, decimals, t, countText }: CollectionCardsProps) {
  const services = sitePath("/services");
  return (
    // reveal-grid: the cards fade and rise in as they scroll into view, one after the other (globals.css).
    <ul className={cn(GRID, "reveal-grid", collections.length === 3 && "lg:grid-cols-3")}>
      {collections.map((collection, i) => {
        const name = collection.kind === "country" ? countryName(collection.value) : collection.value;
        const href = `${services}?${collection.kind}=${encodeURIComponent(collection.value)}`;
        const count = countText(collection.count);
        return (
          <li key={`${collection.kind}:${collection.value}`} className={cn("min-w-0", third(i, collections.length))}>
            <div className={CARD}>
              <Link href={href} aria-label={fmt(t.ctaLabel, { name })} className={cn(HEAD, "group/head rounded-t-card")}>
                <CollectionMark collection={collection} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <h3 className="truncate text-subheading font-bold text-ink">
                    <bdi>{name}</bdi>
                  </h3>
                  <p className="text-small text-ink-muted">
                    {t.kinds[collection.kind]}
                    <span aria-hidden="true"> · </span>
                    <span className="num">{count}</span>
                    <RetailOnly>
                      <span aria-hidden="true"> · </span>
                      {t.from}{" "}
                      <Money
                        amount={collection.from.gross}
                        currency={collection.from.currency}
                        decimals={decimals}
                        className="font-semibold text-ink"
                      />
                    </RetailOnly>
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className={
                    "grid size-9 shrink-0 place-items-center rounded-full border border-line-strong text-ink transition-colors " +
                    "duration-(--duration-base) ease-standard group-hover/head:border-inverse group-hover/head:bg-inverse " +
                    "group-hover/head:text-on-inverse [&_svg]:size-4"
                  }
                >
                  <ArrowRight />
                </span>
              </Link>
              {collection.top.length > 0 ? (
                <ul className={LIST}>
                  {collection.top.map((service) => (
                    <li key={service.id}>
                      <ServiceRow service={service} decimals={decimals} />
                    </li>
                  ))}
                </ul>
              ) : null}
              <Link
                href={href}
                aria-label={fmt(t.viewAllLabel, { services: count, name })}
                className={cn(
                  FOOT,
                  "group/foot text-small font-semibold text-ink transition-colors duration-(--duration-base) ease-standard hover:bg-surface-muted",
                )}
              >
                <span className="num">{fmt(t.viewAll, { services: count })}</span>
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 shrink-0 transition-transform duration-(--duration-base) ease-standard group-hover/foot:translate-x-0.5"
                />
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One best seller: its title (typed by staff or a supplier, so `dir="auto"`), its delivery time and its price. The
 * second line keeps its height without a delivery time, so the rows of the cards stay level.
 */
function ServiceRow({ service, decimals }: { service: StoreServiceCard; decimals: number }) {
  const time = deliveryTime(service).text;
  return (
    <Link
      href={sitePath(`/services/${encodeURIComponent(service.slug)}`)}
      className={cn(ROW, "transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-muted")}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span dir="auto" className="truncate text-small font-medium text-ink">
          {service.title}
        </span>
        <span className="flex h-[1lh] items-center gap-1 text-caption text-ink-subtle">
          {time ? (
            <>
              <Clock aria-hidden="true" className="size-3 shrink-0" />
              <bdi className="truncate">{time}</bdi>
            </>
          ) : null}
        </span>
      </span>
      <OwnPrice serviceId={service.id} className="num shrink-0 text-small font-bold text-ink" placeholderClassName="w-12">
        <Money
          amount={service.price.gross}
          currency={service.price.currency}
          decimals={decimals}
          className="num shrink-0 text-small font-bold text-ink"
        />
      </OwnPrice>
    </Link>
  );
}

/**
 * The mark of a collection: the brand's or carrier's logo when there is a file (docs/LOGOS.md): a symbol in a circle, a
 * word mark in a pill. Else a brand's initials, the globe of a country or the signal of a carrier. The name is written
 * beside it, so it is decorative.
 */
function CollectionMark({ collection }: { collection: Collection }) {
  const folder = collection.kind === "brand" ? "brands" : collection.kind === "network" ? "carriers" : null;
  if (folder && logoFile(folder, collection.value)) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "grid h-10 shrink-0 place-items-center rounded-full border border-line bg-surface",
          isSymbolLogo(folder, collection.value) ? "w-10" : "px-3",
        )}
      >
        <Logo folder={folder} name={collection.value} alt="" size="sm" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-sunken text-small font-bold text-ink [&_svg]:size-[18px]"
    >
      {collection.kind === "country" ? <Globe /> : collection.kind === "network" ? <Signal /> : initialsOf(collection.value)}
    </span>
  );
}

/** Three cards of the same size while the catalog loads: the head, three rows and the foot. */
export function CollectionCardsSkeleton() {
  return (
    <div aria-hidden="true" className={cn(GRID, "lg:grid-cols-3")}>
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn("flex flex-col rounded-card border border-line bg-surface shadow-card", third(i, 3))}>
          <div className={HEAD}>
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="text-subheading">
                <Skeleton className="h-[1lh] w-28" />
              </div>
              <div className="text-small">
                <Skeleton className="h-[1lh] w-44 max-w-full" />
              </div>
            </div>
            <Skeleton className="size-9 shrink-0 rounded-full" />
          </div>
          <div className={LIST}>
            {[0, 1, 2].map((row) => (
              <div key={row} className={ROW}>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="text-small">
                    <Skeleton className="h-[1lh] w-4/5" />
                  </div>
                  <div className="text-caption">
                    <Skeleton className="h-[1lh] w-16" />
                  </div>
                </div>
                <div className="text-small">
                  <Skeleton className="h-[1lh] w-12" />
                </div>
              </div>
            ))}
          </div>
          <div className={cn(FOOT, "text-small")}>
            <Skeleton className="h-[1lh] w-36" />
          </div>
        </div>
      ))}
    </div>
  );
}
