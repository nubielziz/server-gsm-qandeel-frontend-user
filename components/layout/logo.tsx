// Logo: the brand mark + "GSM Store" wordmark (+ the tagline). The mark is public/images/logo-mark.png when the owner has
// added it; until then a text monogram ("GSM" in a near-black rounded square). Never an SVG drawing.
import Image from "next/image";
import Link from "next/link";
import { sitePath } from "@/lib/site-path";
import { common } from "@/lib/i18n/messages/common";
import { siteImage } from "@/lib/site-images";
import { cn } from "@/lib/cn";

export type LogoProps = {
  /** `full` = mark + wordmark (default), `mark` = mark only, `stacked` = mark over a small "GSM STORE" (the dark rail). */
  variant?: "full" | "mark" | "stacked";
  /** Adds the divider and "Digital Services Marketplace" (shown from `lg` up). Only with `full`. */
  tagline?: boolean;
  /** `inverse` for dark surfaces (header on the rail, footer). */
  tone?: "default" | "inverse";
  /** Where it links; defaults to the shop home (`/en`). */
  href?: string;
  className?: string;
};

function Mark({ tone, size }: { tone: "default" | "inverse"; size: number }) {
  const src = siteImage("logo-mark.png");
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn("shrink-0", tone === "inverse" && "invert")}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn(
        "grid shrink-0 place-items-center rounded-[10px] text-[0.6875rem] font-extrabold leading-none tracking-wide",
        tone === "inverse" ? "bg-surface text-ink" : "bg-inverse text-on-inverse",
      )}
    >
      GSM
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
      <Mark tone={tone} size={variant === "stacked" ? 40 : 36} />
      {variant === "full" ? (
        <>
          <span dir="ltr" className={cn("whitespace-nowrap text-[1.375rem] font-extrabold leading-none tracking-tight max-[22.5rem]:hidden", inverse ? "text-on-inverse" : "text-ink")}>
            {t.brand.name}
          </span>
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
          GSM
          <br />
          Store
        </span>
      ) : null}
    </Link>
  );
}
