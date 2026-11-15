// Table primitives: a light-grey header row, hairline row dividers, numbers aligned to the end. Responsive:
// by default the table scrolls horizontally inside its box on small screens; with `stacked` every row becomes a small
// card below 768px (give each TableCell a `label` = its column name).
// Every part carries its ARIA role explicitly: `display: block` (stacked mode on phones) makes browsers drop the
// native table semantics, and the roles keep rows, headers and cells announced. On normal tables they are redundant.
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type TableProps = ComponentProps<"table"> & {
  /** Below 768px show each row as a stacked card instead of scrolling. Cells need `label`. */
  stacked?: boolean;
  /** Draws its own rounded border (when the table is not already inside a Card). */
  framed?: boolean;
  /** Accessible table name, shown only to screen readers. */
  caption?: string;
  /** Classes for the scroll box around the table. */
  wrapperClassName?: string;
};

/** A table inside a horizontally scrolling box. */
export function Table({ stacked, framed, caption, className, wrapperClassName, children, ...props }: TableProps) {
  return (
    <div
      className={cn("relative w-full overflow-x-auto", framed && "rounded-card border border-line bg-surface", wrapperClassName)}
      // `relative`: the visually hidden caption and header labels (`sr-only` is absolutely positioned) stay inside this
      // scroll box instead of widening the page (2026-11-15: a blank strip beside the account frame at 768-1024px).
      // A scrolling box must be reachable by keyboard; it is a named region when the table has a caption.
      tabIndex={stacked ? undefined : 0}
      role={!stacked && caption ? "region" : undefined}
      aria-label={!stacked && caption ? caption : undefined}
    >
      <table role="table" className={cn("w-full border-collapse text-start text-body", stacked && "table-stacked", className)} {...props}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

/** `<thead>` with the light-grey header row look. */
export function TableHead({ className, ...props }: ComponentProps<"thead">) {
  return <thead role="rowgroup" className={cn("bg-surface-muted", className)} {...props} />;
}

/** `<tbody>`. */
export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody role="rowgroup" className={className} {...props} />;
}

export type TableRowProps = ComponentProps<"tr"> & {
  /** Highlights the row (e.g. the selected invoice). */
  selected?: boolean;
};

/** A table row with a hairline divider; `selected` tints it. */
export function TableRow({ selected, className, ...props }: TableRowProps) {
  return (
    <tr
      role="row"
      aria-selected={selected || undefined}
      className={cn("border-b border-line last:border-b-0", selected && "bg-surface-muted", className)}
      {...props}
    />
  );
}

export type TableHeaderCellProps = ComponentProps<"th"> & {
  /** Aligns the column to the end (for amounts and counts). */
  numeric?: boolean;
};

/** A column header cell (`scope="col"` by default). */
export function TableHeaderCell({ numeric, className, scope = "col", ...props }: TableHeaderCellProps) {
  return (
    <th
      role="columnheader"
      scope={scope}
      className={cn(
        "whitespace-nowrap px-4 py-3 text-small font-semibold text-ink-muted first:ps-5 last:pe-5",
        numeric ? "text-end" : "text-start",
        className,
      )}
      {...props}
    />
  );
}

export type TableCellProps = ComponentProps<"td"> & {
  /** Aligns the cell to the end and uses tabular figures (amounts, counts). */
  numeric?: boolean;
  /** Column name shown before the value in `stacked` mode. */
  label?: string;
};

/** A data cell. */
export function TableCell({ numeric, label, className, ...props }: TableCellProps) {
  return (
    <td
      role="cell"
      data-label={label}
      className={cn("px-4 py-3.5 align-middle first:ps-5 last:pe-5", numeric && "num text-end", className)}
      {...props}
    />
  );
}
