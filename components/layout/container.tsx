// Container, Section and PageHeader: the page-level building blocks of every route.
import type { ComponentProps, ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ContainerProps = ComponentProps<"div"> & {
  /** `page` (80rem, default), `wide` (90rem) or `narrow` (48rem: forms, articles). */
  width?: "page" | "wide" | "narrow";
  /** The element to render (default `div`). */
  as?: ElementType;
};

const widths = { page: "max-w-page", wide: "max-w-wide", narrow: "max-w-3xl" } as const;

/** Centres content, caps its width and applies the page gutters (16 / 24 / 32px). */
export function Container({ width = "page", as: Tag = "div", className, ...props }: ContainerProps) {
  return <Tag className={cn("mx-auto w-full px-gutter", widths[width], className)} {...props} />;
}

export type SectionProps = {
  /** Section heading (an `h2`). */
  title?: ReactNode;
  /** One line under the heading. */
  description?: ReactNode;
  /** Link or buttons on the end side of the heading row ("View all"). */
  actions?: ReactNode;
  /** Id of the heading, so `aria-labelledby` can name the section. */
  headingId?: string;
  /**
   * The heading row fades and rises in as it scrolls into view (`.reveal`, globals.css "Scroll reveals"). For sections
   * below the fold; the content reveals itself (a `.reveal-grid` of cards, a `.reveal` block).
   */
  reveal?: boolean;
  className?: string;
  children: ReactNode;
};

/** A vertical block of a page with an optional heading row. Spacing between sections: use `grid gap-8` on the parent. */
export function Section({ title, description, actions, headingId, reveal, className, children }: SectionProps) {
  return (
    <section aria-labelledby={title ? headingId : undefined} className={cn("grid gap-4", className)}>
      {title || actions ? (
        <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-2", reveal && "reveal")}>
          <div className="min-w-0">
            {title ? (
              <h2 id={headingId} className="text-heading text-ink">
                {title}
              </h2>
            ) : null}
            {description ? <p className="mt-1 text-body text-ink-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export type PageHeaderProps = {
  /** The page's `h1`. */
  title: ReactNode;
  /** One line under the title. */
  description?: ReactNode;
  /** Buttons on the end side (a primary action such as "New order"). */
  actions?: ReactNode;
  /** Breadcrumbs or a back link above the title. */
  eyebrow?: ReactNode;
  /** `plain` (default) sits on the page; `card` is the white bar used under the workspace header in the mockups. */
  variant?: "plain" | "card";
  className?: string;
};

/** The top of a page: `h1`, description and an actions slot that wraps under the text on narrow screens. */
export function PageHeader({ title, description, actions, eyebrow, variant = "plain", className }: PageHeaderProps) {
  const card = variant === "card";
  return (
    <header
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-6 gap-y-4",
        card && "rounded-card border border-line bg-surface px-5 py-4 shadow-card sm:px-6",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <div className="mb-2">{eyebrow}</div> : null}
        <h1 className={card ? "text-heading text-ink" : "text-title text-ink"}>{title}</h1>
        {description ? <p className={cn("mt-1 text-body text-ink-muted", !card && "max-w-2xl")}>{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}
