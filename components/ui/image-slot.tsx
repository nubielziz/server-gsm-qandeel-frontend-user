// ImageSlot: a site image (public/images/<file>) in a fixed aspect ratio, or a plain placeholder until the owner adds it.
// Never draw SVG art here: see CLAUDE.md "Images" and docs/IMAGE-PROMPTS.md for the expected files.
import Image from "next/image";
import { siteImage } from "@/lib/site-images";
import { cn } from "@/lib/cn";

export type ImageSlotProps = {
  /** File name in public/images, exactly as in docs/IMAGE-PROMPTS.md (e.g. `home-hero.jpg`). */
  file: string;
  /** Describes the image; use `""` when it is decorative. */
  alt: string;
  /**
   * CSS aspect ratio of the box, e.g. `"16 / 9"`, `"4 / 3"`, `"1 / 1"`; the box keeps it before the image loads.
   * Omit it to fill the nearest positioned parent instead (full-bleed backgrounds such as the sign-in hero).
   */
  aspect?: string;
  /** CSS `object-position` of a cropped image (`"bottom"`, `"center top"`). Default `center`. */
  objectPosition?: string;
  /** The `sizes` attribute: how wide the image is at each breakpoint, e.g. `"(min-width: 1024px) 50vw, 100vw"`. Required for performance. */
  sizes: string;
  /** `cover` (default) crops to fill, `contain` shows the whole image. */
  fit?: "cover" | "contain";
  /**
   * Preloads the image with a `<link>` in the head (next/image `preload`). Use on at most one image per page, and never
   * with `loading` or `fetchPriority`. Next's image docs prefer `loading="eager"` or `fetchPriority="high"` in most cases,
   * and always when the largest image depends on the viewport.
   */
  priority?: boolean;
  /**
   * `lazy` (default) waits until the image nears the viewport; `eager` loads it at once. Use `eager` for an image above
   * the fold (plan P4.2: the home promo image painted about 1 s late on phones while lazy).
   */
  loading?: "lazy" | "eager";
  /** The fetch priority hint: `high` for the image that is the largest above the fold on some screen. */
  fetchPriority?: "high" | "low" | "auto";
  className?: string;
};

/** The site image `file` in an aspect-ratio box, or a neutral grey placeholder of the same size when the file is missing. */
export function ImageSlot({ file, alt, aspect, objectPosition, sizes, fit = "cover", priority, loading, fetchPriority, className }: ImageSlotProps) {
  const src = siteImage(file);
  return (
    <div
      className={cn("overflow-hidden bg-surface-sunken", aspect ? "relative w-full" : "absolute inset-0", className)}
      style={aspect ? { aspectRatio: aspect } : undefined}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          preload={priority}
          loading={loading}
          fetchPriority={fetchPriority}
          style={objectPosition ? { objectPosition } : undefined}
          className={fit === "cover" ? "object-cover" : "object-contain"}
        />
      ) : null}
    </div>
  );
}
