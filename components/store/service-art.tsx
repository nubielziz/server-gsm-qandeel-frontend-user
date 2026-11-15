// Art of a service. Order: the service's own picture (`imageUrl`, a file the API serves at `/store/v1/media/<hash>.<ext>`,
// shown through next/image), then the brand logo, then the owner's `service-<type>.jpg` (docs/IMAGE-PROMPTS.md) in a fixed
// aspect ratio, then a plain tile with a type icon until that file exists. Brand and carrier logos are files
// `brands/<name>.png` and `carriers/<name>.png` (docs/LOGOS.md: transparent, cropped to the logo, drawn at their real
// proportions). Never draws artwork.
import Image from "next/image";
import { Cable, FileArchive, Server, Smartphone, type LucideIcon } from "lucide-react";
import { ImageSlot } from "@/components/ui/image-slot";
import { logoSize, siteImage } from "@/lib/site-images";
import type { ServiceType } from "@/lib/api/types";
import { cn } from "@/lib/cn";

export const serviceTypeIcons: Record<ServiceType, LucideIcon> = {
  imei: Smartphone,
  server: Server,
  remote: Cable,
  file: FileArchive,
};

/** What the API's `imageUrl` may look like: `/store/v1/media/<name>`, one path segment, no query. */
const PICTURE_PATH = /^\/store\/v1\/media\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * The path of a service picture, or null when the service has none (or the value is not a media path of this site:
 * the optimizer only accepts `/store/v1/media/**`, and nothing else from the API is trusted as an image source).
 */
export function servicePicture(imageUrl: string | null | undefined): string | null {
  return imageUrl && PICTURE_PATH.test(imageUrl) ? imageUrl : null;
}

export type LogoFolder = "brands" | "carriers";

/**
 * The picture of a service card (logo, picture or type icon) grows to 1.03 inside its frame while the card is hovered
 * (`group/card`, service-card.tsx). Only a transform: nothing around it moves.
 */
const CARD_ZOOM = "transition-[scale] duration-(--duration-slow) ease-glide group-hover/card:scale-[1.03]";

/** A name as a logo file name: "AT&T" → `at-t`, "T-Mobile" → `t-mobile`, "Bell Canada" → `bell-canada`. */
export function logoSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Other spellings of a logo's name (after `logoSlug`) as catalogs write them. */
const LOGO_ALIASES: Record<string, string> = {
  att: "at-t",
  "at-and-t": "at-t",
  tmobile: "t-mobile",
  "deutsche-telekom": "telekom",
  "3": "three",
  mobinil: "orange",
  "e-and": "etisalat",
  metropcs: "metro",
  iphone: "apple",
  ipad: "apple",
  mi: "xiaomi",
  redmi: "xiaomi",
  psn: "playstation",
};

/**
 * The logo file of a brand or carrier (`brands/apple.png`, `carriers/at-t.png`), or null when there is none. A longer
 * name falls back to its first words: "Cricket Wireless" → `cricket.png`, "T-Mobile USA" → `t-mobile.png`.
 */
export function logoFile(folder: LogoFolder, name: string): string | null {
  const parts = logoSlug(name).split("-").filter(Boolean);
  for (let n = parts.length; n >= 1; n--) {
    const slug = parts.slice(0, n).join("-");
    if (slug.length > 40) continue;
    for (const candidate of [slug, LOGO_ALIASES[slug]]) {
      const file = candidate ? `${folder}/${candidate}.png` : null;
      if (file && siteImage(file)) return file;
    }
  }
  return null;
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
 * The top corner of a service card. With the service's own picture: the picture and the brand name. Else with a brand
 * logo: the logo alone (a symbol keeps the name beside it). Else the type picture (the same for every service of a type,
 * so only a fallback) and the brand name. `md` for cards, `sm` for dense cards.
 */
export function ServiceMark({
  type,
  imageUrl,
  brand,
  size = "md",
  priority,
}: {
  type: ServiceType;
  imageUrl?: string | null;
  brand: string;
  size?: "sm" | "md";
  priority?: boolean;
}) {
  const name = brand ? (
    <span
      dir="auto"
      className={cn(
        "min-w-0 truncate uppercase",
        size === "md" ? "text-body font-extrabold tracking-wide text-ink" : "text-micro text-ink-subtle",
      )}
    >
      {brand}
    </span>
  ) : null;
  if (!servicePicture(imageUrl) && brand && logoFile("brands", brand)) {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {isSymbolLogo("brands", brand) ? (
          <>
            <Logo folder="brands" name={brand} alt="" size={size} className={CARD_ZOOM} />
            {name}
          </>
        ) : (
          <Logo folder="brands" name={brand} size={size} className={CARD_ZOOM} />
        )}
      </span>
    );
  }
  return (
    <span className={cn("flex min-w-0 flex-1 items-center", size === "md" ? "gap-3" : "gap-2.5")}>
      <ServiceThumb type={type} imageUrl={imageUrl} size={size} priority={priority} />
      {name}
    </span>
  );
}
