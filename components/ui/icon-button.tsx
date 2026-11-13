// IconButton: a square button with only an icon. The accessible name is required.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

export type IconButtonVariant = "ghost" | "secondary" | "primary" | "inverse" | "danger";
export type IconButtonSize = "sm" | "md" | "lg";

const variants: Record<IconButtonVariant, string> = {
  ghost: "text-ink hover:bg-surface-sunken active:bg-surface-sunken",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-muted active:bg-surface-sunken",
  primary: "bg-inverse text-on-inverse hover:bg-inverse-raised active:bg-inverse-raised",
  inverse: "bg-surface text-ink hover:bg-surface-sunken active:bg-surface-sunken",
  danger: "bg-danger text-on-inverse hover:bg-danger-ink active:bg-danger-ink",
};

const sizes: Record<IconButtonSize, string> = {
  sm: "size-10 touch-target [&_svg]:size-4",
  md: "size-11 [&_svg]:size-5",
  lg: "size-12 [&_svg]:size-5",
};

const frame =
  "relative inline-flex shrink-0 items-center justify-center rounded-control transition-colors duration-(--duration-fast) ease-standard";

export type IconButtonProps = Omit<ComponentProps<"button">, "aria-label" | "children"> & {
  /** Accessible name and tooltip (e.g. "Close"). Required: an icon alone says nothing to a screen reader. */
  label: string;
  /** The icon: a lucide element. Mirror directional icons with `rtl:-scale-x-100`. */
  children: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Replaces the icon with a spinner and blocks clicks. */
  loading?: boolean;
};

/** A square icon-only button with a required accessible `label`. `type` defaults to "button". */
export function IconButton({
  label,
  children,
  variant = "ghost",
  size = "md",
  loading,
  className,
  type = "button",
  disabled,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        frame,
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

export type IconButtonLinkProps = Omit<ComponentProps<typeof Link>, "aria-label" | "children" | "className" | "href"> & {
  /** Accessible name and tooltip (e.g. "Order AT&T Unlock"). Required. */
  label: string;
  /** In-site path, already language-prefixed with `localePath`. */
  href: string;
  /** The icon: a lucide element. Mirror directional icons with `rtl:-scale-x-100`. */
  children: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Extra classes for layout (margins, stacking). */
  className?: string;
};

/** A link that looks like an IconButton (next/link): a square icon that navigates. */
export function IconButtonLink({ label, children, variant = "ghost", size = "md", className, href, ...props }: IconButtonLinkProps) {
  return (
    <Link href={href} aria-label={label} title={label} className={cn(frame, variants[variant], sizes[size], className)} {...props}>
      {children}
    </Link>
  );
}
