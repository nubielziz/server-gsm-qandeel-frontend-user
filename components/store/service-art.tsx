// Art of a service: the owner's `service-<type>.jpg` (docs/IMAGE-PROMPTS.md) in a fixed aspect ratio, or a plain tile with
// a type icon until the file exists. Brand logos are optional files `brands/<brand>.png`. Never draws artwork.
import Image from "next/image";
import { Cable, FileArchive, Server, Smartphone, type LucideIcon } from "lucide-react";
import { ImageSlot } from "@/components/ui/image-slot";
import { siteImage } from "@/lib/site-images";
import type { ServiceType } from "@/lib/api/types";
import { cn } from "@/lib/cn";

export const serviceTypeIcons: Record<ServiceType, LucideIcon> = {
  imei: Smartphone,
  server: Server,
  remote: Cable,
  file: FileArchive,
};

/** The logo file name of a brand: "Apple" → `brands/apple.png`, "Mi Phone" → `brands/mi-phone.png`; null for an unsafe name. */
export function brandLogoFile(brand: string): string | null {
  const slug = brand
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return /^[a-z0-9][a-z0-9-]{0,40}$/.test(slug) ? `brands/${slug}.png` : null;
}

export type ServiceArtProps = {
  type: ServiceType;
  /** The `sizes` attribute of the image (how wide it is at each breakpoint). */
  sizes: string;
  /** CSS aspect ratio, default `16 / 10`. */
  aspect?: string;
  priority?: boolean;
  className?: string;
};

/** The service art (decorative: the title next to it names the service). */
export function ServiceArt({ type, sizes, aspect = "16 / 10", priority, className }: ServiceArtProps) {
  const file = `service-${type}.jpg`;
  if (siteImage(file)) {
    return <ImageSlot file={file} alt="" aspect={aspect} sizes={sizes} priority={priority} className={className} />;
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

/** A small brand logo when the owner supplied one (`brands/<brand>.png`), else nothing. */
export function BrandLogo({ brand, className }: { brand: string; className?: string }) {
  const file = brand ? brandLogoFile(brand) : null;
  const src = file ? siteImage(file) : null;
  if (!src) return null;
  return <Image src={src} alt={brand} width={96} height={48} className={cn("h-6 w-auto object-contain", className)} />;
}
