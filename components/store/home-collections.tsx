// "Featured collections" of the home page (mockup): large banners for the brands, countries and carriers with the most
// services (lib/catalog-facets.ts), each opening the catalog filtered by it. The catalog has no categories (handoff
// §1.7), so these groups are what a collection can be. The art sits on the start side like the mockup: the owner's
// optional files `collections/<kind>-<name>.jpg` (docs/IMAGE-PROMPTS.md), on light cards. Until one exists the card shows
// its lit surface (dark for the first one) and an icon of its kind.
import { Globe, Signal, Smartphone, type LucideIcon } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import type { Collection, CollectionKind } from "@/lib/catalog-facets";
import { cn } from "@/lib/cn";
import { countryName } from "@/lib/countries";
import { fmt } from "@/lib/i18n/define";
import { localePath, type Locale } from "@/lib/i18n/config";
import type { StoreMessages } from "@/lib/i18n/messages/store";
import { siteImage } from "@/lib/site-images";
import { BannerArt, OutlineTag, linkArrow, litSurface, type BannerTone } from "./banner";
import { Logo, logoFile } from "./service-art";

const kindIcons: Record<CollectionKind, LucideIcon> = { brand: Smartphone, country: Globe, network: Signal };

/**
 * The art file of a collection: "Apple" → `collections/brand-apple.jpg`, "US" → `collections/country-us.jpg`,
 * "AT&T" → `collections/carrier-at-t.jpg`. Null when the name has no Latin letters or digits.
 */
export function collectionArtFile(kind: CollectionKind, value: string): string | null {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug || slug.length > 40) return null;
  return `collections/${kind === "network" ? "carrier" : kind}-${slug}.jpg`;
}

/** The grid: two collections share the row; with three the last one spans both columns until the row fits three. */
const GRID = "grid gap-4 md:grid-cols-2";
const third = (i: number, total: number) => total === 3 && i === 2 && "md:max-lg:col-span-2";

export type CollectionBannersProps = {
  collections: Collection[];
  locale: Locale;
  /** Display decimals of the visitor's currency. */
  decimals: number;
  t: StoreMessages["home"]["collections"];
  /** "8 services" */
  countText: (count: number) => string;
};

export function CollectionBanners({ collections, locale, decimals, t, countText }: CollectionBannersProps) {
  const services = localePath(locale, "/services");
  return (
    <ul className={cn(GRID, collections.length === 3 && "lg:grid-cols-3")}>
      {collections.map((collection, i) => {
        const file = collectionArtFile(collection.kind, collection.value);
        const hasArt = file !== null && siteImage(file) !== null;
        // Which collection comes first depends on the catalog, so the images are made for light cards (docs/IMAGE-PROMPTS.md):
        // only the first card without an image takes the dark surface.
        const tone: BannerTone = i === 0 && !hasArt ? "inverse" : "light";
        const inverse = tone === "inverse";
        const name = collection.kind === "country" ? countryName(collection.value, locale) : collection.value;
        const Icon = kindIcons[collection.kind];
        // Logos are made for light backgrounds: the dark card keeps the icon.
        const logoFolder = collection.kind === "brand" ? "brands" : collection.kind === "network" ? "carriers" : null;
        return (
          <li key={`${collection.kind}:${collection.value}`} className={cn(third(i, collections.length))}>
            <Card tone={inverse ? "inverse" : "default"} radius="card" className={cn("relative h-full min-h-52 overflow-hidden", litSurface(file, tone))}>
              {file ? (
                <BannerArt
                  file={file}
                  alt=""
                  sizes="(min-width: 1024px) 15rem, (min-width: 768px) 24vw, 48vw"
                  tone={tone}
                  side="start"
                  className="w-[48%]"
                />
              ) : null}
              <div className={cn("relative flex flex-1 flex-col items-start justify-center gap-2.5 p-5 sm:p-6", hasArt && "ms-auto w-[62%]")}>
                <div className="flex w-full items-center justify-between gap-3">
                  <OutlineTag tone={tone}>{t.kinds[collection.kind]}</OutlineTag>
                  {hasArt ? null : logoFolder && !inverse && logoFile(logoFolder, collection.value) ? (
                    <Logo folder={logoFolder} name={collection.value} alt="" />
                  ) : (
                    <Icon aria-hidden="true" className={cn("size-5", inverse ? "text-on-inverse-muted" : "text-ink-subtle")} />
                  )}
                </div>
                <h3 className={cn("mt-1 text-heading", inverse ? "text-on-inverse" : "text-ink")}>
                  <bdi>{name}</bdi>
                </h3>
                <p className={cn("text-small", inverse ? "text-on-inverse-muted" : "text-ink-muted")}>
                  <span className="num">{countText(collection.count)}</span>
                  <span aria-hidden="true"> · </span>
                  {t.from}{" "}
                  <Money
                    amount={collection.from.gross}
                    currency={collection.from.currency}
                    locale={locale}
                    decimals={decimals}
                    className={cn("font-semibold", inverse ? "text-on-inverse" : "text-ink")}
                  />
                </p>
                <ButtonLink
                  href={`${services}?${collection.kind}=${encodeURIComponent(collection.value)}`}
                  variant={inverse ? "inverse" : "secondary"}
                  size="sm"
                  className="group mt-2"
                  endIcon={linkArrow}
                  aria-label={fmt(t.ctaLabel, { name })}
                >
                  {t.cta}
                </ButtonLink>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

/** Three banner-sized blocks while the catalog loads. */
export function CollectionBannersSkeleton() {
  return (
    <div aria-hidden="true" className={cn(GRID, "lg:grid-cols-3")}>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className={cn("h-52 rounded-card", third(i, 3))} />
      ))}
    </div>
  );
}
