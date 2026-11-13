// Badge: a small pill (or tag) with a tinted background. For order / invoice / ticket states use StatusBadge.
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "inverse" | "outline";

/** Tint of each tone (background + text meet 4.5:1). */
export const badgeToneClasses: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-ink-muted",
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
  inverse: "bg-inverse text-on-inverse",
  outline: "border border-line-strong bg-surface text-ink-muted",
};

export type BadgeProps = Omit<ComponentProps<"span">, "children"> & {
  tone?: BadgeTone;
  /** Icon (lucide element) before the text; sized automatically. */
  icon?: ReactNode;
  /** `pill` (fully rounded, default) or `tag` (6px radius). */
  shape?: "pill" | "tag";
  /** A smaller upper-case label (11px, letter-spaced): the category tag of a card ("IMEI CHECK"). Short words only. */
  caps?: boolean;
  children: ReactNode;
};

/** A small tinted label. Never rely on colour alone: the text (and ideally an icon) carries the meaning. */
export function Badge({ tone = "neutral", icon, shape = "pill", caps, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 whitespace-nowrap py-1 leading-none",
        caps ? "px-2 text-micro uppercase" : "px-2.5 text-small font-semibold",
        "[&_svg]:size-3.5 [&_svg]:shrink-0",
        shape === "pill" ? "rounded-full" : "rounded-badge",
        badgeToneClasses[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}
