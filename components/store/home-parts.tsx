// Parts of the home page (mockup "E-Commerce"): dark hero, quick IMEI card, track promo, brand tiles, "how it works" and
// the destination banners. They show only what the API can do: browse, check an IMEI, track an order, open a ticket,
// become a merchant. No cart, favourites, stock or order counts. Card art is the owner's files
// (docs/IMAGE-PROMPTS.md); until a file exists the card keeps its plain lit surface.
import Form from "next/form";
import Link from "next/link";
import {
  Headset,
  LayoutGrid,
  LifeBuoy,
  ListOrdered,
  PackageSearch,
  ScanSearch,
  ShieldCheck,
  Signal,
  Store,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { initialsOf } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { localePath, type Locale } from "@/lib/i18n/config";
import type { StoreMessages } from "@/lib/i18n/messages/store";
import { siteImage } from "@/lib/site-images";
import { BannerArt, OutlineTag, linkArrow as arrow, litSurface } from "./banner";
import { ServiceCardMiniSkeleton } from "./service-card";
import { Logo, logoFile } from "./service-art";

type Home = StoreMessages["home"];

/** One feature point of the hero (an icon and a short text). */
export function HeroPoint({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-2 [&_svg]:size-4 [&_svg]:text-on-inverse-muted">
      {icon}
      {text}
    </li>
  );
}

/** The third point says whether an account is needed: it depends on the shop's checkout policy, so the page streams it. */
export function GuestPoint({ guestCheckout, t }: { guestCheckout: boolean; t: Home }) {
  return <HeroPoint icon={<UserRound aria-hidden="true" />} text={guestCheckout ? t.hero.pointNoAccount : t.hero.pointAccount} />;
}

/** "$0.79 Starting from": the lowest listed price in the visitor's currency (the page streams it). */
export function HeroPrice({ amount, currency, locale, decimals, label }: { amount: string; currency: string; locale: Locale; decimals: number; label: string }) {
  return (
    <p className="flex items-baseline gap-2.5">
      {/* English shows the amount first, like the mockup; it is still read as "Starting from $0.79". */}
      <span className="text-small font-medium text-on-inverse-muted ltr:order-2">{label}</span>
      <Money amount={amount} currency={currency} locale={locale} decimals={decimals} className="text-stat text-on-inverse" />
    </p>
  );
}

/** Holds the line of HeroPrice while the price loads, so the button under it does not move. */
export function HeroPriceSpace() {
  return (
    <p aria-hidden="true" className="text-stat">
      &nbsp;
    </p>
  );
}

export function HomeHero({ locale, t, thirdPoint, price }: { locale: Locale; t: Home; thirdPoint: ReactNode; price: ReactNode }) {
  return (
    <Card tone="inverse" className={cn("relative overflow-hidden lg:min-h-[25.5rem]", litSurface("home-hero.jpg", "inverse"))}>
      {/* Eager instead of a preload: the largest image depends on the screen (this one from md up, the promo below it),
          and Next's image docs advise against `preload` then. No high fetch priority, because phones hide this image
          and the promo is their high-priority image (plan P4.2). */}
      <BannerArt
        file="home-hero.jpg"
        alt={t.hero.artAlt}
        sizes="(min-width: 768px) 45vw, 1px"
        loading="eager"
        tone="inverse"
        className="hidden w-3/5 md:block"
      />
      <div className="relative flex flex-1 flex-col items-start justify-center gap-5 p-6 sm:p-8 md:max-w-[39rem] lg:p-10">
        <OutlineTag tone="inverse">{t.hero.eyebrow}</OutlineTag>
        <div className="grid gap-3">
          <h1 className="text-hero text-on-inverse">{t.hero.headline}</h1>
          <p className="text-body text-on-inverse-muted">{t.hero.subline}</p>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-small font-medium text-on-inverse">
          <HeroPoint icon={<ShieldCheck aria-hidden="true" />} text={t.hero.pointPay} />
          <HeroPoint icon={<PackageSearch aria-hidden="true" />} text={t.hero.pointTrack} />
          {thirdPoint}
        </ul>
        <div className="grid justify-items-start gap-4">
          {price}
          <ButtonLink href={localePath(locale, "/services")} variant="inverse" className="group" endIcon={arrow}>
            {t.hero.cta}
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}

/** Quick IMEI check: a GET form to the IMEI check page (the page validates and checks). */
export function QuickImeiCard({ locale, t }: { locale: Locale; t: Home }) {
  return (
    <Card className="sheen-surface justify-center p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-control bg-inverse text-on-inverse">
          <ScanSearch aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-heading text-ink">{t.quick.title}</h2>
          <p className="text-small text-ink-muted">{t.quick.text}</p>
        </div>
      </div>
      <Form action={localePath(locale, "/imei-check")} className="mt-4">
        <Input
          name="imei"
          label={t.quick.label}
          labelHidden
          hint={t.quick.hint}
          placeholder={t.quick.placeholder}
          inputMode="numeric"
          autoComplete="off"
          maxLength={24}
          required
          trailing={
            <IconButton type="submit" variant="primary" size="sm" label={t.quick.submit} className="group">
              {arrow}
            </IconButton>
          }
        />
      </Form>
    </Card>
  );
}

/** Dark promo card: where to track an order. */
export function TrackPromoCard({ locale, t }: { locale: Locale; t: Home }) {
  return (
    <Card tone="inverse" className={cn("relative flex-1 overflow-hidden", litSurface("home-promo.jpg", "inverse"))}>
      {/* Above the fold on phones: load it at once and first (plan P4.2), not when lazy loading reaches it. */}
      <BannerArt
        file="home-promo.jpg"
        alt={t.promo.artAlt}
        sizes="(min-width: 1024px) 14rem, 55vw"
        loading="eager"
        fetchPriority="high"
        tone="inverse"
        className="w-[55%]"
      />
      <div className={cn("relative flex flex-1 flex-col items-start justify-center gap-2.5 p-5 sm:p-6", siteImage("home-promo.jpg") && "max-w-[64%]")}>
        <p className="text-micro uppercase text-on-inverse-muted">{t.promo.eyebrow}</p>
        <h2 className="text-heading text-on-inverse">{t.promo.title}</h2>
        <p className="max-w-[18rem] text-small text-on-inverse-muted">{t.promo.text}</p>
        <ButtonLink href={localePath(locale, "/track")} variant="inverse" size="sm" className="group mt-1.5" endIcon={arrow}>
          {t.promo.cta}
        </ButtonLink>
      </div>
    </Card>
  );
}

const tileClasses =
  "group flex h-full flex-col items-center justify-center gap-0.5 rounded-card border border-line bg-surface px-3 py-3.5 text-center shadow-card " +
  "transition-[border-color,box-shadow] duration-(--duration-base) ease-standard hover:border-line-strong hover:shadow-raised";

const tileMarkClasses =
  "mb-1.5 grid size-9 place-items-center rounded-full bg-surface-sunken text-small font-bold text-ink transition-colors " +
  "duration-(--duration-base) ease-standard group-hover:bg-inverse group-hover:text-on-inverse [&_svg]:size-[18px]";

export type CatalogTile = {
  /** Which catalog filter the tile sets. */
  kind: "brand" | "network";
  name: string;
  /** "32 services" */
  count: string;
};

/**
 * The mark of a tile: the brand's or carrier's logo when there is a file (docs/LOGOS.md), else a brand's initials or
 * the signal icon of a carrier. The tile writes the name under it, so the logo is decorative.
 */
function TileMark({ tile }: { tile: CatalogTile }) {
  const folder = tile.kind === "network" ? "carriers" : "brands";
  if (logoFile(folder, tile.name)) {
    return (
      <span className="mb-1.5 grid h-9 place-items-center">
        <Logo folder={folder} name={tile.name} alt="" size="lg" />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={tileMarkClasses}>
      {tile.kind === "network" ? <Signal /> : initialsOf(tile.name)}
    </span>
  );
}

/**
 * A strip of tiles (mockup: the category row): the brands and carriers with the most services, then the whole catalog.
 * Each tile opens the catalog filtered by it. Scrolls sideways on small screens.
 */
export function CatalogTiles({ tiles, all, locale, label }: { tiles: CatalogTile[]; all: { name: string; count: string }; locale: Locale; label: string }) {
  const services = localePath(locale, "/services");
  return (
    // `min-w-0`: as a grid item the strip must scroll inside the page, not widen it.
    <nav aria-label={label} className="min-w-0">
      <ul className="-mx-gutter -my-1 flex gap-3 overflow-x-auto px-gutter py-1 lg:mx-0 lg:overflow-visible lg:px-0">
        {tiles.map((tile) => (
          <li key={`${tile.kind}:${tile.name}`} className="min-w-[8.5rem] flex-1 lg:min-w-0">
            <Link href={`${services}?${tile.kind}=${encodeURIComponent(tile.name)}`} className={tileClasses}>
              <TileMark tile={tile} />
              <span dir="auto" className="max-w-full truncate text-small font-bold text-ink">
                {tile.name}
              </span>
              <span className="num text-caption text-ink-subtle">{tile.count}</span>
            </Link>
          </li>
        ))}
        <li className="min-w-[8.5rem] flex-1 lg:min-w-0">
          <Link href={services} className={tileClasses}>
            <span aria-hidden="true" className={tileMarkClasses}>
              <LayoutGrid />
            </span>
            <span className="max-w-full truncate text-small font-bold text-ink">{all.name}</span>
            <span className="num text-caption text-ink-subtle">{all.count}</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}

/** The strip of CatalogTiles while the catalog loads (same height). */
export function CatalogTilesSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="-mx-gutter flex min-w-0 gap-3 overflow-hidden px-gutter lg:mx-0 lg:px-0">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cn(tileClasses, "min-w-[8.5rem] flex-1 lg:min-w-0")}>
          <Skeleton className="mb-1.5 size-9 rounded-full" />
          <div className="text-small">
            <Skeleton className="h-[1lh] w-16" />
          </div>
          <div className="text-caption">
            <Skeleton className="h-[1lh] w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The heading row of a panel card: an icon, the `h2` and an optional link on the end side (mockup "Best Sellers"). */
export function PanelHeading({ id, icon, title, action }: { id: string; icon: ReactNode; title: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5 [&_svg]:size-5 [&_svg]:shrink-0">
        {icon}
        <h2 id={id} className="text-heading text-ink">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

/**
 * A panel card with a heading row (`PanelHeading`) and a body that fills the card: the "Best sellers" list beside "How
 * it works". `id` names the heading, so the card is a region with the panel's title as its name.
 */
export function HomePanel({ id, icon, title, action, children }: { id: string; icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card as="section" aria-labelledby={id} className="p-5 sm:p-6">
      <PanelHeading id={id} icon={icon} title={title} action={action} />
      <div className="mt-3 flex flex-1 flex-col">{children}</div>
    </Card>
  );
}

/** The grid of dense cards (`ServiceCardMini`): two columns on a phone, four from `md` up. `flex-1` fills a panel's body. */
const MINI_GRID = "grid flex-1 grid-cols-2 gap-3 md:grid-cols-4";

/** Dense cards in a row: the best sellers panel and the new arrivals section. */
export function MiniGrid({ children }: { children: ReactNode }) {
  return <div className={MINI_GRID}>{children}</div>;
}

/** `MiniGrid` while the catalog loads: the same grid of cards of the same size. */
export function MiniGridSkeleton({ count }: { count: number }) {
  return (
    <div className={MINI_GRID}>
      {Array.from({ length: count }, (_, i) => (
        <ServiceCardMiniSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * "How it works": three numbered steps in a panel card. `stack` lists them under each other from `xl` up (beside the
 * "Best sellers" panel); `row` keeps them side by side (when the panel stands alone).
 */
export function HowItWorks({ t, layout }: { t: Home["how"]; layout: "stack" | "row" }) {
  const steps = [
    { title: t.step1Title, text: t.step1Text },
    { title: t.step2Title, text: t.step2Text },
    { title: t.step3Title, text: t.step3Text },
  ];
  const stack = layout === "stack";
  return (
    <Card as="section" aria-labelledby="home-how" className="h-full p-5 sm:p-6">
      <PanelHeading id="home-how" icon={<ListOrdered aria-hidden="true" />} title={t.title} />
      <ol className={cn("mt-3 grid flex-1 gap-x-8 md:grid-cols-3", stack && "xl:grid-cols-1")}>
        {steps.map((step, i) => (
          <li
            key={step.title}
            className={cn(
              "flex gap-3.5 border-line py-3 max-md:not-first:border-t",
              stack && "xl:items-center xl:not-first:border-t",
            )}
          >
            <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-inverse text-small font-bold text-on-inverse" aria-hidden="true">
              {i + 1}
            </span>
            <div className="min-w-0">
              <h3 className="text-body font-bold text-ink">{step.title}</h3>
              <p className="mt-0.5 text-small text-ink-muted">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

type Banner = {
  key: "merchants" | "help" | "support";
  tone: "inverse" | "light";
  file: string;
  icon: LucideIcon;
  href: string;
};

/** Three banners to the other parts of the site: merchants, help center, support. */
export function DestinationBanners({ locale, t }: { locale: Locale; t: Home["explore"] }) {
  const banners: Banner[] = [
    { key: "merchants", tone: "inverse", file: "home-merchants.jpg", icon: Store, href: localePath(locale, "/merchant/register") },
    { key: "help", tone: "light", file: "home-help.jpg", icon: LifeBuoy, href: localePath(locale, "/help") },
    { key: "support", tone: "light", file: "home-support.jpg", icon: Headset, href: localePath(locale, "/support") },
  ];
  return (
    <ul className="grid gap-4 lg:grid-cols-3">
      {banners.map(({ key, tone, file, icon: Icon, href }) => {
        const m = t[key];
        const inverse = tone === "inverse";
        // With the owner's image the text keeps to the start side; without it an icon marks the corner instead.
        const hasArt = siteImage(file) !== null;
        return (
          <li key={key}>
            <Card tone={inverse ? "inverse" : "default"} radius="card" className={cn("relative h-full overflow-hidden", litSurface(file, tone))}>
              <BannerArt file={file} alt={m.artAlt} sizes="(min-width: 1024px) 14rem, 45vw" tone={tone} className="w-[45%]" />
              <div className={cn("relative flex flex-1 flex-col items-start gap-2.5 p-5 sm:p-6", hasArt && "max-w-[68%]")}>
                <div className="flex w-full items-center justify-between gap-3">
                  <OutlineTag tone={tone}>{m.tag}</OutlineTag>
                  {hasArt ? null : <Icon aria-hidden="true" className={cn("size-5", inverse ? "text-on-inverse-muted" : "text-ink-subtle")} />}
                </div>
                <h3 className={cn("mt-1 text-heading", inverse ? "text-on-inverse" : "text-ink")}>{m.title}</h3>
                {/* Dot-separated points. Each dot hangs before its item, so the one that starts a line is clipped away. */}
                <div className="overflow-hidden">
                  <ul className={cn("-ms-4 flex flex-wrap text-small", inverse ? "text-on-inverse-muted" : "text-ink-muted")}>
                    {[m.point1, m.point2, m.point3].map((point) => (
                      <li key={point} className="relative ps-4 before:absolute before:start-1.5 before:content-['·']">
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <ButtonLink href={href} variant={inverse ? "inverse" : "secondary"} size="sm" className="group mt-2" endIcon={arrow}>
                  {m.cta}
                </ButtonLink>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
