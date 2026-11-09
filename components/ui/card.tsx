// Card and its parts. A white box with a 1px light border and a 12px radius; `inverse` is the dark hero card.
import type { ComponentProps, ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type CardProps = ComponentProps<"div"> & {
  /** The element to render (default `div`). Use `section`/`article` for landmarks, `li` inside a list. */
  as?: ElementType;
  /** `default` white, `muted` grey fill without shadow, `inverse` near-black with white text. */
  tone?: "default" | "muted" | "inverse";
};

const tones = {
  default: "rounded-card border border-line bg-surface shadow-card",
  muted: "rounded-card border border-line bg-surface-muted",
  inverse: "surface-inverse rounded-panel border border-inverse",
} as const;

/** A card surface. Compose with CardHeader / CardBody / CardFooter, or put your own padding inside. */
export function Card({ as: Tag = "div", tone = "default", className, ...props }: CardProps) {
  return <Tag className={cn("flex min-w-0 flex-col", tones[tone], className)} {...props} />;
}

export type CardHeaderProps = Omit<ComponentProps<"div">, "title"> & {
  /** Card title (rendered as a heading). */
  title: ReactNode;
  /** One line under the title. */
  description?: ReactNode;
  /** Buttons or links on the end side of the header. */
  actions?: ReactNode;
  /** Heading level element, `h2` by default. */
  titleAs?: "h2" | "h3" | "h4" | "p";
  /** Draws a divider line under the header. */
  divided?: boolean;
};

/** The top of a card: title, optional description and an actions slot on the end side. */
export function CardHeader({ title, description, actions, titleAs: Title = "h2", divided, className, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn(
        "card-header flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 pt-5 sm:px-6 sm:pt-6",
        divided && "border-b border-line pb-4",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <Title className="text-heading text-ink">{title}</Title>
        {description ? <p className="mt-1 text-body text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export type CardBodyProps = ComponentProps<"div"> & {
  /** No padding: for tables and lists that run edge to edge. */
  flush?: boolean;
};

/** The padded content area of a card. */
export function CardBody({ flush, className, ...props }: CardBodyProps) {
  return (
    <div
      className={cn(!flush && "p-5 sm:p-6 [.card-header+&]:pt-4 sm:[.card-header+&]:pt-4", flush && "[.card-header+&]:mt-4", className)}
      {...props}
    />
  );
}

/** The bottom bar of a card (actions, summary), separated by a light line on a muted background. */
export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mt-auto flex flex-wrap items-center justify-between gap-3 rounded-b-card border-t border-line bg-surface-muted px-5 py-4 sm:px-6",
        className,
      )}
      {...props}
    />
  );
}
