// Static parts of the home page (mockup "E-Commerce": dark hero, quick order card, promo card, how it works). They show
// only what the API can do: browse, check an IMEI, track an order. No cart, favourites, stock or order counts.
import Form from "next/form";
import Link from "next/link";
import { ArrowRight, PackageSearch, ScanSearch, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ImageSlot } from "@/components/ui/image-slot";
import { Input } from "@/components/ui/input";
import { localePath, type Locale } from "@/lib/i18n/config";
import type { StoreMessages } from "@/lib/i18n/messages/store";
import { siteImage } from "@/lib/site-images";

/** Art slot on the end side of a dark card: the owner's image, or a quiet raised surface with an icon until it exists. */
function DarkArt({ file, alt, sizes, priority, className }: { file: string; alt: string; sizes: string; priority?: boolean; className: string }) {
  const has = siteImage(file) !== null;
  return (
    <div aria-hidden={has ? undefined : "true"} className={className}>
      {has ? (
        <ImageSlot file={file} alt={alt} sizes={sizes} priority={priority} />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-inverse-raised text-on-inverse-muted">
          <Smartphone className="size-16 opacity-40" strokeWidth={1.25} />
        </div>
      )}
    </div>
  );
}

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
export function GuestPoint({ guestCheckout, t }: { guestCheckout: boolean; t: StoreMessages["home"] }) {
  return <HeroPoint icon={<UserRound aria-hidden="true" />} text={guestCheckout ? t.hero.pointNoAccount : t.hero.pointAccount} />;
}

export function HomeHero({ locale, t, thirdPoint }: { locale: Locale; t: StoreMessages["home"]; thirdPoint: ReactNode }) {
  return (
    <Card tone="inverse" className="relative min-h-[22rem] overflow-hidden lg:min-h-[26rem]">
      <DarkArt
        file="home-hero.jpg"
        alt={t.hero.artAlt}
        sizes="(min-width: 768px) 50vw, 1px"
        priority
        className="absolute inset-y-0 end-0 hidden w-1/2 md:block"
      />
      <div aria-hidden="true" className="absolute inset-y-0 end-0 hidden w-2/3 bg-linear-to-r from-inverse via-inverse/70 to-transparent md:block rtl:bg-linear-to-l" />
      <div className="relative flex flex-1 flex-col items-start justify-center gap-6 p-6 sm:p-10 md:max-w-[34rem] lg:p-12">
        <span className="rounded-full border border-on-inverse-muted/40 px-3 py-1 text-small font-semibold text-on-inverse">{t.hero.eyebrow}</span>
        <div className="grid gap-4">
          <h1 className="text-display text-on-inverse">{t.hero.headline}</h1>
          <p className="max-w-md text-subheading font-normal text-on-inverse-muted">{t.hero.subline}</p>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-small font-medium text-on-inverse">
          <HeroPoint icon={<ShieldCheck aria-hidden="true" />} text={t.hero.pointPay} />
          <HeroPoint icon={<PackageSearch aria-hidden="true" />} text={t.hero.pointTrack} />
          {thirdPoint}
        </ul>
        <ButtonLink href={localePath(locale, "/services")} variant="inverse" size="lg" endIcon={<ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />}>
          {t.hero.cta}
        </ButtonLink>
      </div>
    </Card>
  );
}

/** Quick IMEI check: a GET form to the IMEI check page (the page validates and checks). */
export function QuickImeiCard({ locale, t }: { locale: Locale; t: StoreMessages["home"] }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-control bg-inverse text-on-inverse">
          <ScanSearch aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-heading text-ink">{t.quick.title}</h2>
          <p className="text-small text-ink-muted">{t.quick.text}</p>
        </div>
      </div>
      <Form action={localePath(locale, "/imei-check")} className="mt-4 grid gap-3">
        <Input
          name="imei"
          label={t.quick.label}
          placeholder={t.quick.placeholder}
          inputMode="numeric"
          autoComplete="off"
          maxLength={24}
          required
          dir="auto"
        />
        <Button type="submit" block endIcon={<ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />}>
          {t.quick.submit}
        </Button>
      </Form>
    </Card>
  );
}

/** Dark promo card: where to track an order. */
export function TrackPromoCard({ locale, t }: { locale: Locale; t: StoreMessages["home"] }) {
  return (
    <Card tone="inverse" className="relative min-h-[13rem] flex-1 overflow-hidden">
      <DarkArt
        file="home-promo.jpg"
        alt={t.promo.artAlt}
        sizes="(min-width: 1024px) 22rem, 100vw"
        className="absolute inset-0"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-linear-to-r from-inverse via-inverse/80 to-inverse/30 rtl:bg-linear-to-l" />
      <div className="relative flex flex-1 flex-col items-start justify-end gap-3 p-5 sm:p-6">
        <p className="text-small font-semibold uppercase tracking-wide text-on-inverse-muted">{t.promo.eyebrow}</p>
        <h2 className="text-heading text-on-inverse">{t.promo.title}</h2>
        <p className="max-w-xs text-small text-on-inverse-muted">{t.promo.text}</p>
        <ButtonLink href={localePath(locale, "/track")} variant="inverse" size="sm" endIcon={<ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />}>
          {t.promo.cta}
        </ButtonLink>
      </div>
    </Card>
  );
}

/** "How it works": three numbered steps. */
export function HowItWorks({ t }: { t: StoreMessages["home"]["how"] }) {
  const steps = [
    { title: t.step1Title, text: t.step1Text },
    { title: t.step2Title, text: t.step2Text },
    { title: t.step3Title, text: t.step3Text },
  ];
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {steps.map((step, i) => (
        <li key={step.title}>
          <Card className="h-full p-5 sm:p-6">
            <span className="num grid size-9 place-items-center rounded-full bg-inverse text-body font-bold text-on-inverse" aria-hidden="true">
              {i + 1}
            </span>
            <h3 className="mt-4 text-subheading text-ink">{step.title}</h3>
            <p className="mt-1 text-body text-ink-muted">{step.text}</p>
          </Card>
        </li>
      ))}
    </ol>
  );
}

/** Brand chips: each links to the catalog filtered by that brand. */
export function BrandChips({ brands, locale, chipLabel }: { brands: string[]; locale: Locale; chipLabel: string }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {brands.map((brand) => (
        <li key={brand}>
          <Link
            href={`${localePath(locale, "/services")}?brand=${encodeURIComponent(brand)}`}
            aria-label={chipLabel.replace("{brand}", brand)}
            className="touch-target inline-flex h-11 items-center rounded-full border border-line-strong bg-surface px-5 text-body font-semibold text-ink transition-colors hover:border-ink hover:bg-surface-muted"
          >
            {brand}
          </Link>
        </li>
      ))}
    </ul>
  );
}
