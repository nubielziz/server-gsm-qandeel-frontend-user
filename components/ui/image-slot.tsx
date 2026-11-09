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
  /** Marks the image as the page's largest visible element (preloads it). Use on at most one image per page. */
  priority?: boolean;
  className?: string;
};

/** The site image `file` in an aspect-ratio box, or a neutral grey placeholder of the same size when the file is missing. */
export function ImageSlot({ file, alt, aspect, objectPosition, sizes, fit = "cover", priority, className }: ImageSlotProps) {
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
          style={objectPosition ? { objectPosition } : undefined}
          className={fit === "cover" ? "object-cover" : "object-contain"}
        />
      ) : null}
    </div>
  );
}
