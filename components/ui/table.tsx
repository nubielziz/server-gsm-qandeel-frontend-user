// Table primitives: a light-grey header row, hairline row dividers, numbers aligned to the end. Responsive:
// by default the table scrolls horizontally inside its box on small screens; with `stacked` every row becomes a small
// card below 768px (give each TableCell a `label` = its column name); with `compact` the same markup becomes a short
// list row on phones (plan P1.1): the long lists (orders, services, invoices, wallet) used to render a second, phone-only
// list next to the table, which doubled their DOM.
// Every part carries its ARIA role explicitly: `display: block` (stacked mode on phones) makes browsers drop the
// native table semantics, and the roles keep rows, headers and cells announced. On normal tables they are redundant.
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Where a cell goes in a `compact` row below 768px (from `md` up every cell is a normal table cell):
 * line 1 holds `title`, `badge` and, at the end side, `amount`; `subtitle` takes a line of its own; `meta` and
 * `meta-labeled` flow as small muted text under it. `hide` drops the cell on phones (an actions column the row link
 * replaces, an empty value). `meta-labeled` keeps the column name before the value (a bare "3" says nothing).
 */
export type PhoneSlot = "title" | "badge" | "amount" | "subtitle" | "meta" | "meta-labeled" | "hide";

// Below md the cells of a `compact` table are flex items of their row. Utilities beat the `.table-stacked` rules in
// globals.css (that is a lower layer), so these only override what a compact row changes. `tbody` only: the header row
// is visually hidden. `relative` anchors the title link's `::after`, which stretches the link over the whole row (one
// big touch target, as the phone list had); `focus-within` shows which row holds the keyboard focus.
const compactRows =
  "max-md:[&_tbody_tr]:relative max-md:[&_tbody_tr]:flex max-md:[&_tbody_tr]:flex-wrap max-md:[&_tbody_tr]:items-center " +
  "max-md:[&_tbody_tr]:gap-x-3 max-md:[&_tbody_tr]:gap-y-1 max-md:[&_tbody_tr]:px-4 max-md:[&_tbody_tr]:py-3.5 " +
  "max-md:[&_tbody_tr:focus-within]:bg-surface-muted";

// A phone slot's classes. Every slot but `meta-labeled` hides the stacked layout's `data-label` text.
const phoneBase = "max-md:w-auto max-md:justify-start max-md:p-0 max-md:text-start max-md:before:hidden";
const phoneSlots: Record<PhoneSlot, string> = {
  title: `${phoneBase} max-md:order-1 max-md:font-semibold max-md:text-ink`,
  badge: `${phoneBase} max-md:order-2`,
  amount: `${phoneBase} max-md:order-3 max-md:ms-auto max-md:font-semibold max-md:text-ink`,
  subtitle: `${phoneBase} max-md:order-4 max-md:basis-full max-md:text-ink`,
  meta: `${phoneBase} max-md:order-5 max-md:text-small max-md:text-ink-subtle`,
  "meta-labeled":
    "max-md:w-auto max-md:justify-start max-md:gap-1 max-md:p-0 max-md:text-start max-md:order-5 max-md:text-small max-md:text-ink-subtle",
  hide: "max-md:hidden",
};

export type TableProps = ComponentProps<"table"> & {
  /** Below 768px show each row as a stacked card instead of scrolling. Cells need `label`. */
  stacked?: boolean;
  /**
   * Below 768px show each row as a short list row (implies `stacked`): give every TableCell a `phone` slot. The long
   * lists use this instead of rendering a second list for phones. Rows with a link put it in the `title` cell, and the
   * link covers the whole row (`max-md:after:absolute max-md:after:inset-0` on the link).
   */
  compact?: boolean;
  /** Draws its own rounded border (when the table is not already inside a Card). */
  framed?: boolean;
  /** Accessible table name, shown only to screen readers. */
  caption?: string;
  /** Classes for the scroll box around the table. */
  wrapperClassName?: string;
};

/** A table inside a horizontally scrolling box. */
export function Table({ stacked: stackedProp, compact, framed, caption, className, wrapperClassName, children, ...props }: TableProps) {
  const stacked = stackedProp || compact;
  // A plain stacked table is cards on every screen it would scroll on, so it needs no scroll box. A compact table is a
  // real table from md up and can still be wider than its box at 768-1024px: that box must be reachable by keyboard.
  const scrolls = !stacked || compact;
  return (
    <div
      className={cn("relative w-full overflow-x-auto", framed && "rounded-card border border-line bg-surface", wrapperClassName)}
      // `relative`: the visually hidden caption and header labels (`sr-only` is absolutely positioned) stay inside this
      // scroll box instead of widening the page (2026-11-15: a blank strip beside the account frame at 768-1024px).
      // A scrolling box must be reachable by keyboard; it is a named region when the table has a caption.
      tabIndex={scrolls ? 0 : undefined}
      role={scrolls && caption ? "region" : undefined}
      aria-label={scrolls && caption ? caption : undefined}
    >
      <table
        role="table"
        className={cn("w-full border-collapse text-start text-body", stacked && "table-stacked", compact && compactRows, className)}
        {...props}
      >
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
  /** Where the cell goes in a `compact` row on phones; see `PhoneSlot`. Without it the cell keeps the stacked look. */
  phone?: PhoneSlot;
};

/** A data cell. */
export function TableCell({ numeric, label, phone, className, ...props }: TableCellProps) {
  return (
    <td
      role="cell"
      data-label={label}
      className={cn(
        // A phone slot has no padding of its own below md (the row pads); from md up it is a normal cell.
        phone ? "md:px-4 md:py-3.5 md:first:ps-5 md:last:pe-5" : "px-4 py-3.5 first:ps-5 last:pe-5",
        "align-middle",
        numeric && "num text-end",
        phone && phoneSlots[phone],
        className,
      )}
      {...props}
    />
  );
}
