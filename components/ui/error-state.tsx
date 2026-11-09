// ErrorState: a failed load, in plain words, with the request reference for support and a retry slot.
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ErrorStateProps = {
  title: ReactNode;
  /** One sentence in the visitor's language (translate the API error `code`; never show raw server text). */
  message?: ReactNode;
  /** "Reference: abc123" (from `useErrorText().reference(error)`): what support needs to find the request. */
  reference?: string;
  /** The retry button or a link home. */
  action?: ReactNode;
  /** Replaces the default warning icon. */
  icon?: ReactNode;
  /** Less padding, for use inside a card. */
  compact?: boolean;
  className?: string;
};

/** A centred error message with an optional reference line and retry action. Announced as an alert. */
export function ErrorState({ title, message, reference, action, icon, compact, className }: ErrorStateProps) {
  return (
    <div role="alert" className={cn("flex flex-col items-center text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      <span className="mb-4 grid size-14 place-items-center rounded-full bg-danger-soft text-danger-ink [&_svg]:size-6">
        {icon ?? <TriangleAlert aria-hidden="true" />}
      </span>
      <h3 className="text-subheading text-ink">{title}</h3>
      {message ? <p className="mt-1.5 max-w-sm text-body text-ink-muted">{message}</p> : null}
      {reference ? <p className="mt-3 text-small text-ink-subtle num">{reference}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{action}</div> : null}
    </div>
  );
}
