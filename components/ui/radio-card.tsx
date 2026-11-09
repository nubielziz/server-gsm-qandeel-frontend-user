// RadioCard and RadioGroup: selectable cards (payment methods, account type …). Native radios, so keyboard (arrows),
// form submission and `name` grouping work without JavaScript. Server-compatible.
import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type RadioCardProps = Omit<ComponentProps<"input">, "type" | "title" | "children"> & {
  /** Main text of the card. */
  title: ReactNode;
  /** Secondary text under the title. */
  description?: ReactNode;
  /** Icon (lucide element) before the title. */
  icon?: ReactNode;
  /** Content on the end side (brand marks, a price …). */
  trailing?: ReactNode;
  /** `inverse` draws a dark card (e.g. the wallet option at checkout). */
  tone?: "default" | "inverse";
  /** Extra content under the title row, always visible (e.g. balance lines). */
  children?: ReactNode;
  /** Classes for the card. */
  cardClassName?: string;
};

/** A selectable card wrapping a native radio input. Give every card of a group the same `name`. */
export function RadioCard({
  title,
  description,
  icon,
  trailing,
  tone = "default",
  children,
  className,
  cardClassName,
  ...props
}: RadioCardProps) {
  const inverse = tone === "inverse";
  return (
    <label
      className={cn(
        "relative flex cursor-pointer gap-3.5 rounded-card border p-4 transition-colors duration-(--duration-fast) ease-standard",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
        inverse
          ? "surface-inverse border-inverse has-[:checked]:ring-2 has-[:checked]:ring-on-inverse/60"
          : "border-line bg-surface hover:border-control has-[:checked]:border-ink has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-ink)]",
        cardClassName,
      )}
    >
      <input type="radio" className={cn("peer sr-only", className)} {...props} />
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-5 shrink-0 rounded-full border-2 transition-colors",
          inverse
            ? "border-on-inverse-muted peer-checked:border-on-inverse peer-checked:bg-on-inverse peer-checked:shadow-[inset_0_0_0_3px_var(--color-inverse)]"
            : "border-control peer-checked:border-inverse peer-checked:bg-inverse peer-checked:shadow-[inset_0_0_0_3px_var(--color-surface)]",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 items-start gap-3">
            {icon ? <span className="mt-0.5 shrink-0 [&_svg]:size-5">{icon}</span> : null}
            <span className="min-w-0">
              <span className="block text-body font-semibold">{title}</span>
              {description ? (
                <span className={cn("mt-0.5 block text-small", inverse ? "text-on-inverse-muted" : "text-ink-subtle")}>
                  {description}
                </span>
              ) : null}
            </span>
          </span>
          {trailing ? <span className="shrink-0">{trailing}</span> : null}
        </span>
        {children ? <span className="mt-3 block">{children}</span> : null}
      </span>
    </label>
  );
}

export type RadioGroupProps = {
  /** Visible group title (the fieldset legend). */
  legend: ReactNode;
  /** Help text under the legend. */
  hint?: ReactNode;
  /** Error text for the group. */
  error?: string | undefined;
  /** Marks the group required (a `*` after the legend). */
  required?: boolean;
  /** Hides the legend visually (kept for screen readers). */
  legendHidden?: boolean;
  /** Columns of cards from `sm` up: 1 (default), 2 or 3. */
  columns?: 1 | 2 | 3;
  className?: string;
  children: ReactNode;
};

const columnClasses = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3" } as const;

/** A `<fieldset>` for a group of RadioCards (or radios), with legend, hint and error wired up. */
export function RadioGroup({ legend, hint, error, required, legendHidden, columns = 1, className, children }: RadioGroupProps) {
  const id = useId().replace(/:/g, "");
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset aria-describedby={describedBy} aria-invalid={error ? true : undefined} className={cn("grid gap-3", className)}>
      <legend className={cn("mb-1 text-small font-semibold text-ink", legendHidden && "sr-only")}>
        {legend}
        {required ? (
          <span aria-hidden="true" className="ms-0.5 text-danger-ink">
            *
          </span>
        ) : null}
      </legend>
      {hint ? (
        <p id={`${id}-hint`} className="-mt-1 text-small text-ink-subtle">
          {hint}
        </p>
      ) : null}
      <div className={cn("grid gap-3", columnClasses[columns])}>{children}</div>
      <div id={`${id}-error`} aria-live="polite">
        {error ? <p className="text-small font-medium text-danger-ink">{error}</p> : null}
      </div>
    </fieldset>
  );
}
