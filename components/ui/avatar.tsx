// Avatar: initials in a circle. There are no photos in the product, so this is the only avatar.
import { cn } from "@/lib/cn";

export type AvatarProps = {
  /** The person's name; initials come from its first and last word. */
  name: string;
  size?: "sm" | "md" | "lg";
  /** `dark` (default) on light surfaces, `light` on the dark rail. */
  tone?: "dark" | "light";
  /** Accessible name; when omitted the avatar is decorative (the name is shown next to it). */
  label?: string;
  className?: string;
};

const sizes = { sm: "size-8 text-caption", md: "size-10 text-small", lg: "size-14 text-heading" } as const;

/**
 * Up to two initials: "Alex Morgan" → "AM". The first character of a word in any script, so a name typed in Arabic
 * gives its first letter (group C).
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return `${first}${last}`.toLocaleUpperCase();
}

/** A round initials badge. */
export function Avatar({ name, size = "md", tone = "dark", label, className }: AvatarProps) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "inline-grid shrink-0 select-none place-items-center rounded-full font-bold",
        sizes[size],
        tone === "dark" ? "bg-inverse text-on-inverse" : "bg-surface text-ink",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
