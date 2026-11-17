// Logo: the IMEI-HUB mark (the "IH" in its orbit) + the "IMEI-HUB" wordmark (+ the tagline). Both are the owner's own logo,
// cut into files under public/images/: logo-mark.png and logo-wordmark.png for light surfaces, the *-inverse.png pair (white
// ink, the same gold) for dark ones. Until a file exists a plain text stands in for it. Never an SVG drawing.
import Image from "next/image";
import Link from "next/link";
import { sitePath } from "@/lib/site-path";
import { common } from "@/lib/i18n/messages/common";
import { siteImage } from "@/lib/site-images";
import { cn } from "@/lib/cn";

export type LogoProps = {
  /** `full` = mark + wordmark (default), `mark` = mark only, `stacked` = mark over a small "IMEI-HUB" (the dark rail). */
  variant?: "full" | "mark" | "stacked";
  /** Adds the divider and the tagline (shown from `lg` up). Only with `full`. */
  tagline?: boolean;
  /** `inverse` for dark surfaces (header on the rail, footer). */
  tone?: "default" | "inverse";
  /** Where it links; defaults to the shop home (`/en`). */
  href?: string;
  className?: string;
};

/**
 * The boxes the two pictures are drawn in (`object-contain` keeps their shape). Whole pixels on purpose: a fractional width
 * makes a full header row scroll sideways by a pixel. Beside the name the logo is smaller below `sm`, so the store header
 * still fits its four controls on a phone (signed in: search, bell, account, menu) and in a 345 px wide window; the name
 * itself is hidden from 360 px down. The mark stands about 1.8 times as tall as the name, as in the owner's logo.
 */
const MARK_BOX = {
  /** 28 x 38 px, from `sm` 36 x 48 px. */
  row: "h-7 w-[2.375rem] sm:h-9 sm:w-12",
  /** 36 x 48 px: the dark rail (`lg` and up). */
  stacked: "h-9 w-12",
} as const;
/** 16 x 98 px, from `sm` 20 x 123 px. */
const WORDMARK_BOX = "h-4 w-[6.125rem] sm:h-5 sm:w-[7.6875rem]";

function Mark({ tone, box }: { tone: "default" | "inverse"; box: keyof typeof MARK_BOX }) {
  // A dark surface takes the light-ink file; without it the dark mark is inverted, which is right only for a one-colour mark.
  const light = tone === "inverse" ? siteImage("logo-mark-inverse.png") : null;
  const src = light ?? siteImage("logo-mark.png");
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={48}
        height={36}
        className={cn("shrink-0 object-contain", MARK_BOX[box], tone === "inverse" && !light && "invert")}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[10px] text-[0.6875rem] font-extrabold leading-none tracking-wide",
        tone === "inverse" ? "bg-surface text-ink" : "bg-inverse text-on-inverse",
      )}
    >
      IH
    </span>
  );
}

/** The name beside the mark: the wordmark picture, or the name as text while the file is missing. Hidden on very narrow screens. */
function Wordmark({ tone, name }: { tone: "default" | "inverse"; name: string }) {
  const inverse = tone === "inverse";
  const src = siteImage(inverse ? "logo-wordmark-inverse.png" : "logo-wordmark.png");
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={123}
        height={20}
        className={cn("shrink-0 object-contain max-[22.5rem]:hidden", WORDMARK_BOX)}
      />
    );
  }
  return (
    <span
      dir="ltr"
      className={cn(
        "whitespace-nowrap text-[1.375rem] font-extrabold leading-none tracking-tight max-[22.5rem]:hidden",
        inverse ? "text-on-inverse" : "text-ink",
      )}
    >
      {name}
    </span>
  );
}

/** The site logo as a link to the shop home. Server component. */
export function Logo({ variant = "full", tagline, tone = "default", href, className }: LogoProps) {
  const t = common;
  const inverse = tone === "inverse";
  return (
    <Link
      href={href ?? sitePath()}
      aria-label={t.brand.logoAlt}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center rounded-control",
        variant === "stacked" ? "flex-col justify-center gap-1.5" : "gap-2.5",
        className,
      )}
    >
      <Mark tone={tone} box={variant === "stacked" ? "stacked" : "row"} />
      {variant === "full" ? (
        <>
          <Wordmark tone={tone} name={t.brand.name} />
          {tagline ? (
            <span className="hidden items-center gap-3 lg:flex" aria-hidden="true">
              <span className={cn("h-6 w-px", inverse ? "bg-on-inverse-muted/40" : "bg-line-strong")} />
              <span className={cn("text-body", inverse ? "text-on-inverse-muted" : "text-ink-subtle")}>{t.brand.tagline}</span>
            </span>
          ) : null}
        </>
      ) : null}
      {variant === "stacked" ? (
        <span dir="ltr" className="text-center text-[0.625rem] font-extrabold uppercase leading-tight tracking-wider">
          IMEI
          <br />
          HUB
        </span>
      ) : null}
    </Link>
  );
}
