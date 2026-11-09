// DescriptionList: label / value rows (Invoice Preview, Ticket Information). Semantic <dl>.
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type DescriptionListProps = ComponentProps<"dl"> & {
  /** Remove the dividers between rows. */
  flush?: boolean;
};

/** A list of label/value pairs. Fill it with DescriptionItem. */
export function DescriptionList({ flush, className, ...props }: DescriptionListProps) {
  return <dl className={cn(!flush && "divide-y divide-line", className)} {...props} />;
}

export type DescriptionItemProps = {
  /** The label (term), on the start side. */
  label: ReactNode;
  /** The value (details), on the end side. Use `<Money />` for amounts. */
  children: ReactNode;
  /** Stronger row (totals): bold value on a muted band. */
  emphasis?: boolean;
  className?: string;
};

/** One row of a DescriptionList. */
export function DescriptionItem({ label, children, emphasis, className }: DescriptionItemProps) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-2.5",
        emphasis && "rounded-control bg-surface-muted px-3 py-3 text-heading",
        className,
      )}
    >
      <dt className={cn("text-body", emphasis ? "font-bold text-ink" : "text-ink-subtle")}>{label}</dt>
      <dd className={cn("min-w-0 text-end text-body", emphasis ? "num font-extrabold text-ink" : "font-medium text-ink")}>
        {children}
      </dd>
    </div>
  );
}
