// EmptyState: "nothing here yet" with an icon, a short explanation and one next step.
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type EmptyStateProps = {
  /** Outline icon (lucide element). */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** A button or link: the one useful next step. */
  action?: ReactNode;
  /** Less padding, for use inside a card. */
  compact?: boolean;
  className?: string;
};

/** A centred empty-list message. Pair it with an action that helps (clear filters, browse services). */
export function EmptyState({ icon, title, description, action, compact, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      {icon ? (
        <span className="mb-4 grid size-14 place-items-center rounded-full bg-surface-sunken text-ink-muted [&_svg]:size-6">
          {icon}
        </span>
      ) : null}
      <h3 className="text-subheading text-ink">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-body text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
