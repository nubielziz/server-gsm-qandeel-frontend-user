// Pieces shared by the home page's banner cards (hero, track promo, featured collections, destination banners): the
// outlined tag, the owner's image on one side fading into the card, the lit surface shown while that image is missing,
// and the arrow of their link buttons. Images are the owner's files (docs/IMAGE-PROMPTS.md), never drawn artwork.
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { ImageSlot } from "@/components/ui/image-slot";
import { cn } from "@/lib/cn";
import { siteImage } from "@/lib/site-images";

export type BannerTone = "inverse" | "light";

/** The arrow of a link button (`endIcon`). The button leans it towards where the link goes on hover. */
export const linkArrow = <ArrowRight aria-hidden="true" />;

/** A short upper-case label in an outlined tag (mockup "FEATURED PRODUCT"). */
export function OutlineTag({ tone, children }: { tone: BannerTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-badge border px-2 py-1 text-micro uppercase leading-none",
        tone === "inverse" ? "border-on-inverse-muted/50 text-on-inverse" : "border-line-strong bg-surface text-ink-muted",
      )}
    >
      {children}
    </span>
  );
}

export type BannerArtProps = {
  file: string;
  alt: string;
  sizes: string;
  /** `eager` for a banner above the fold (the hero, the track promo); default `lazy`. See `ImageSlot`. */
  loading?: "lazy" | "eager";
  /** `high` for the banner that is the largest image above the fold on some screen. See `ImageSlot`. */
  fetchPriority?: "high" | "low" | "auto";
  tone: BannerTone;
  /** The side of the card the image takes (default `end`); the text stands on the other side. */
  side?: "start" | "end";
  /** Its width (and where it appears). */
  className: string;
};

/**
 * The owner's image on one side of a banner card, fading into the card towards the text. Renders nothing until the
 * file exists (the card then shows only its surface). The images keep their subject on the outer side (right for `end`,
 * left for `start`, docs/IMAGE-PROMPTS.md): the crop keeps that side.
 */
export function BannerArt({ file, alt, sizes, loading, fetchPriority, tone, side = "end", className }: BannerArtProps) {
  if (!siteImage(file)) return null;
  const end = side === "end";
  return (
    <div className={cn("absolute inset-y-0", end ? "end-0" : "start-0", className)}>
      <ImageSlot
        file={file}
        alt={alt}
        sizes={sizes}
        loading={loading}
        fetchPriority={fetchPriority}
        objectPosition={end ? "right center" : "left center"}
      />
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 via-40% to-transparent to-75%",
          end ? "bg-linear-to-r" : "bg-linear-to-l",
          tone === "inverse" ? "from-inverse via-inverse/75" : "from-surface via-surface/75",
        )}
      />
    </div>
  );
}

/**
 * The lit surface of a banner card while its image is missing. With the image the card stays plain, so the image fades
 * into one flat colour without a seam.
 */
export function litSurface(file: string | null, tone: BannerTone): string | false {
  return (file === null || siteImage(file) === null) && (tone === "inverse" ? "sheen-inverse" : "sheen-surface");
}
