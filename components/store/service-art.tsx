// Art of a service. Order: the service's own picture (`imageUrl`, a file the API serves at `/store/v1/media/<hash>.<ext>`,
// shown through next/image), then the brand logo, then the owner's `service-<type>.jpg` (docs/IMAGE-PROMPTS.md) in a fixed
// aspect ratio, then a plain tile with a type icon until that file exists. Brand and carrier logos are files
// `brands/<name>.png` and `carriers/<name>.png` (docs/LOGOS.md: transparent, cropped to the logo, drawn at their real
// proportions). Never draws artwork.
import Image from "next/image";
import type { ReactNode } from "react";
import { Cable, FileArchive, Server, Smartphone, type LucideIcon } from "lucide-react";
import { ImageSlot } from "@/components/ui/image-slot";
import { logoSize, siteImage } from "@/lib/site-images";
import type { ServiceType } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { logoCandidates, servicePicture, type LogoFolder } from "@/lib/logo-names";

export const serviceTypeIcons: Record<ServiceType, LucideIcon> = {
  imei: Smartphone,
  server: Server,
  remote: Cable,
  file: FileArchive,
};

export type { LogoFolder } from "@/lib/logo-names";
export { logoSlug, servicePicture } from "@/lib/logo-names";

/**
 * The picture of a service card (logo, picture or type icon) grows to 1.03 inside its frame while the card is hovered
 * (`group/card`, service-card.tsx). Only a transform: nothing around it moves.
 */
const CARD_ZOOM = "transition-[scale] duration-(--duration-slow) ease-glide group-hover/card:scale-[1.03]";

/**
 * The logo file of a brand or carrier (`brands/apple.png`, `carriers/at-t.png`), or null when there is none. A longer
 * name falls back to its first words: "Cricket Wireless" → `cricket.png`, "T-Mobile USA" → `t-mobile.png` (the rules
 * are lib/logo-names.ts, shared with the search box).
 */
export function logoFile(folder: LogoFolder, name: string): string | null {
  return logoCandidates(folder, name).find((file) => siteImage(file) !== null) ?? null;
}

const logoSizes = {
  /** Dense cards: 20 px high. */
  sm: "h-5 max-w-[6rem]",
  /** Cards: 24 px high. */
  md: "h-6 max-w-[7.5rem]",
  /** Tiles: 28 px high, narrower. */
  lg: "h-7 max-w-[6.5rem]",
  /** In place of a service picture (quick view, service page): 64 px high. */
  xl: "h-16 max-w-[75%]",
} as const;

export type LogoProps = {
  folder: LogoFolder;
  name: string;
  /** Default: the name. Pass "" when the name is written next to the logo. */
  alt?: string;
  size?: keyof typeof logoSizes;
  /** Extra classes (motion, such as the card zoom); not for its size. */
  className?: string;
};

/** A brand or carrier logo at its real proportions, or nothing when there is no file. */
export function Logo({ folder, name, alt, size = "md", className }: LogoProps) {
  const file = name ? logoFile(folder, name) : null;
  const src = file ? siteImage(file) : null;
  if (!file || !src) return null;
  // A logo added without `npm run logos` has no recorded size yet: it fits a 2:1 box.
  const box = logoSize(file) ?? { width: 96, height: 48 };
  return (
    <Image
      src={src}
      alt={alt ?? name}
      width={box.width}
      height={box.height}
      className={cn("w-auto shrink-0 object-contain", logoSizes[size], className)}
    />
  );
}

/** Whether a logo is a symbol rather than a word mark (Apple's apple, AT&T's globe): it says less without the name. */
export function isSymbolLogo(folder: LogoFolder, name: string): boolean {
  const file = name ? logoFile(folder, name) : null;
  const box = file ? logoSize(file) : null;
  return Boolean(box && box.width / box.height < 1.8);
}

export type ServiceArtProps = {
  type: ServiceType;
  /** The service's own picture (`imageUrl` of the API, or null): when it has one it is shown instead of everything below. */
  imageUrl?: string | null;
  /** The service's brand: when it has a logo, the logo takes the place of the type picture. */
  brand?: string;
  /** The `sizes` attribute of the image (how wide it is at each breakpoint). */
  sizes: string;
  /** CSS aspect ratio, default `16 / 10`. */
  aspect?: string;
  priority?: boolean;
  /** `cover` (default) crops to fill; `contain` shows the whole image (wide boxes: the art is 4:3 with the subject in the middle). */
  fit?: "cover" | "contain";
  className?: string;
};

/** A service picture in an aspect-ratio box (decorative: the title next to it names the service). */
function PictureBox({
  src,
  sizes,
  aspect,
  priority,
  fit = "cover",
  className,
}: {
  src: string;
  sizes: string;
  aspect: string;
  priority?: boolean;
  fit?: "cover" | "contain";
  className?: string;
}) {
  return (
    <div style={{ aspectRatio: aspect }} className={cn("relative w-full overflow-hidden bg-surface-sunken", className)}>
      <Image src={src} alt="" fill sizes={sizes} preload={priority} className={fit === "cover" ? "object-cover" : "object-contain"} />
    </div>
  );
}

/**
 * The picture of a service (decorative: the title next to it names the service). The service's own picture comes first.
 * The type pictures are the same for every service of a type, so they are a fallback: a brand with a logo shows its logo
 * on a quiet lit surface instead.
 */
export function ServiceArt({ type, imageUrl, brand, sizes, aspect = "16 / 10", priority, fit, className }: ServiceArtProps) {
  const picture = servicePicture(imageUrl);
  if (picture) return <PictureBox src={picture} sizes={sizes} aspect={aspect} priority={priority} fit={fit} className={className} />;
  if (brand && logoFile("brands", brand)) {
    return (
      <div style={{ aspectRatio: aspect }} className={cn("sheen-surface grid w-full place-items-center overflow-hidden p-6", className)}>
        <Logo folder="brands" name={brand} alt="" size="xl" />
      </div>
    );
  }
  const file = `service-${type}.jpg`;
  if (siteImage(file)) {
    return <ImageSlot file={file} alt="" aspect={aspect} sizes={sizes} priority={priority} fit={fit} className={className} />;
  }
  const Icon = serviceTypeIcons[type];
  return (
    <div
      aria-hidden="true"
      style={{ aspectRatio: aspect }}
      className={cn("grid w-full place-items-center overflow-hidden bg-surface-sunken text-ink-subtle", className)}
    >
      <Icon className="size-1/4 min-w-8 max-w-14" strokeWidth={1.5} />
    </div>
  );
}

/**
 * A small square of the service art for compact cards: the service's own picture, else the owner's `service-<type>.jpg`,
 * else the type icon on a quiet tile.
 */
export function ServiceThumb({
  type,
  imageUrl,
  size = "md",
  priority,
}: {
  type: ServiceType;
  imageUrl?: string | null;
  size?: "sm" | "md";
  priority?: boolean;
}) {
  const file = `service-${type}.jpg`;
  const box = size === "sm" ? "size-10" : "size-12";
  const picture = servicePicture(imageUrl);
  if (picture) {
    return (
      <span className={cn("relative block shrink-0 overflow-hidden rounded-control bg-surface-sunken", box)}>
        <Image src={picture} alt="" fill sizes="64px" preload={priority} className={cn("object-cover", CARD_ZOOM)} />
      </span>
    );
  }
  if (siteImage(file)) {
    return (
      <span className={cn("relative block shrink-0 overflow-hidden rounded-control", box)}>
        <ImageSlot file={file} alt="" sizes="64px" priority={priority} className={CARD_ZOOM} />
      </span>
    );
  }
  const Icon = serviceTypeIcons[type];
  return (
    <span aria-hidden="true" className={cn("grid shrink-0 place-items-center rounded-control bg-surface-sunken text-ink", box)}>
      <Icon className={cn("size-1/2", CARD_ZOOM)} strokeWidth={1.75} />
    </span>
  );
}

/**
 * The identity corner of a service card. With the service's own picture: the picture, then the brand name over the
 * `caption` (the service type). Else with a brand logo: a word mark over the caption, or a symbol (Apple's apple) beside the
 * name and the caption. Else the type picture (the same for every service of a type, so only a fallback) beside the name
 * and the caption. `md` for cards, `sm` for dense cards.
 */
export function ServiceMark({
  type,
  imageUrl,
  brand,
  caption,
  size = "md",
  priority,
}: {
  type: ServiceType;
  imageUrl?: string | null;
  brand: string;
  /** A short line under the brand (the card passes the service type's name). */
  caption?: string;
  size?: "sm" | "md";
  priority?: boolean;
}) {
  const name = brand ? (
    <span
      dir="auto"
      className={cn(
        "block min-w-0 max-w-full truncate uppercase",
        size === "md" ? "text-body font-extrabold tracking-wide text-ink" : "text-micro text-ink-muted",
      )}
    >
      {brand}
    </span>
  ) : null;
  const sub = caption ? <span className="block min-w-0 max-w-full truncate text-caption text-ink-subtle">{caption}</span> : null;
  const words = (top: ReactNode) => (top || sub ? <span className="flex min-w-0 flex-col gap-0.5">{top}{sub}</span> : null);
  const row = cn("flex min-w-0 flex-1 items-center", size === "md" ? "gap-3" : "gap-2.5");
  if (!servicePicture(imageUrl) && brand && logoFile("brands", brand)) {
    if (isSymbolLogo("brands", brand)) {
      return (
        <span className={row}>
          <Logo folder="brands" name={brand} alt="" size={size} className={CARD_ZOOM} />
          {words(name)}
        </span>
      );
    }
    return (
      <span className={cn("flex min-w-0 flex-1 flex-col items-start", size === "md" ? "gap-1" : "gap-0.5")}>
        <Logo folder="brands" name={brand} size={size} className={CARD_ZOOM} />
        {sub}
      </span>
    );
  }
  return (
    <span className={row}>
      <ServiceThumb type={type} imageUrl={imageUrl} size={size} priority={priority} />
      {words(name)}
    </span>
  );
}
