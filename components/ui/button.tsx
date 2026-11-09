// Button and ButtonLink: the only way to draw a button in pages. Server-compatible (no hooks).
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "inverse" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-semibold " +
  "transition-colors duration-(--duration-fast) ease-standard select-none " +
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 " +
  "aria-busy:disabled:opacity-100 " +
  "[&_svg]:size-[1.125em] [&_svg]:shrink-0";

const variants: Record<ButtonVariant, string> = {
  /** Near-black filled: the main action of a screen. */
  primary: "rounded-control bg-inverse text-on-inverse hover:bg-inverse-raised active:bg-inverse-raised",
  /** White with a border: the secondary action next to a primary. */
  secondary:
    "rounded-control border border-line-strong bg-surface text-ink hover:bg-surface-muted active:bg-surface-sunken",
  /** No box until hovered: toolbars, table row actions. */
  ghost: "rounded-control text-ink hover:bg-surface-sunken active:bg-surface-sunken",
  /** White on dark surfaces (e.g. "Add funds" on the dark balance card). */
  inverse: "rounded-control bg-surface text-ink hover:bg-surface-sunken active:bg-surface-sunken",
  /** Destructive action. */
  danger: "rounded-control bg-danger text-on-inverse hover:bg-danger-ink active:bg-danger-ink",
  /** Looks like an underlined link, behaves like a button. */
  link: "touch-target rounded-badge text-ink underline decoration-1 underline-offset-4 hover:decoration-2",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-10 px-3.5 text-small touch-target",
  md: "h-11 px-5 text-body",
  lg: "h-12 px-6 text-subheading",
};

const linkSizes = "h-auto px-0 text-inherit";

export type ButtonClassOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width of the container. */
  block?: boolean;
  /** Fully rounded ends (a pill) instead of the 10px radius. */
  pill?: boolean;
  /** Extra classes for layout (margins, grid placement). Do not use it to override the button's own colours, size or radius: use the props. */
  className?: string;
};

/** The class string of a button, to style another element (a `<summary>`, a custom link) like one. */
export function buttonClasses({ variant = "primary", size = "md", block, pill, className }: ButtonClassOptions = {}): string {
  return cn(
    base,
    variants[variant],
    pill && variant !== "link" && "rounded-full!",
    variant === "link" ? linkSizes : sizes[size],
    block && "w-full",
    className,
  );
}

type CommonProps = ButtonClassOptions & {
  /** Icon (a lucide element) before the label. Mirror directional icons with `rtl:-scale-x-100`. */
  startIcon?: ReactNode;
  /** Icon after the label. */
  endIcon?: ReactNode;
};

export type ButtonProps = Omit<ComponentProps<"button">, "className"> &
  CommonProps & {
    /** Shows a spinner, sets `aria-busy` and blocks clicks while an action runs. The label keeps its width. */
    loading?: boolean;
  };

/** A button. `type` defaults to "button": pass `type="submit"` for form submit buttons. */
export function Button({
  variant,
  size,
  block,
  pill,
  className,
  startIcon,
  endIcon,
  loading,
  type = "button",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, block, pill, className })}
      {...props}
    >
      <span className={cn("inline-flex items-center justify-center gap-2", loading && "opacity-0")}>
        {startIcon}
        {children}
        {endIcon}
      </span>
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      ) : null}
    </button>
  );
}

export type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "className" | "href"> &
  CommonProps & {
    /** In-site path (already language-prefixed with `localePath`) or an absolute URL. */
    href: string;
    /** Opens an external URL in a new tab with `rel="noopener noreferrer"`. */
    external?: boolean;
  };

/** A link that looks like a button (next/link). */
export function ButtonLink({
  variant,
  size,
  block,
  pill,
  className,
  startIcon,
  endIcon,
  external,
  href,
  children,
  ...props
}: ButtonLinkProps) {
  const classes = buttonClasses({ variant, size, block, pill, className });
  const content = (
    <>
      {startIcon}
      {children}
      {endIcon}
    </>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...props}>
      {content}
    </Link>
  );
}
