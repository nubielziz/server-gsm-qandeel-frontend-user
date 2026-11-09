// Spinner: a turning ring for pending actions. Decorative by default; pass `label` when it stands alone.
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type SpinnerProps = {
  /** Icon size in px (default 16). */
  size?: number;
  /** Accessible text. Omit when a nearby label already says what is loading (the ring is then hidden from readers). */
  label?: string;
  className?: string;
};

/** A turning ring (lucide LoaderCircle). Keeps turning slowly under prefers-reduced-motion. */
export function Spinner({ size = 16, label, className }: SpinnerProps) {
  return (
    <LoaderCircle
      size={size}
      className={cn("shrink-0 animate-spin", className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
