// Checkbox and Switch: native inputs with a custom box. Server-compatible; uncontrolled or controlled.
import { useId, type ComponentProps, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export type CheckboxProps = Omit<ComponentProps<"input">, "type" | "children" | "size"> & {
  /** The visible label (the whole row is clickable). */
  label: ReactNode;
  /** Secondary text under the label, linked with aria-describedby. */
  description?: ReactNode;
  /** Error text; sets `aria-invalid` and shows the message under the row. */
  error?: string | undefined;
  /** Classes for the outer wrapper. */
  wrapperClassName?: string;
  /**
   * `md` (default): a 44px row with a 20px box. `sm`: a dense list row (filter lists): 32px with a mouse, 44px on touch
   * screens, a 16px box and small text that turns bold when checked.
   */
  size?: "md" | "sm";
  /** Content at the end of the row, e.g. a count "(8)" (part of the label). */
  trailing?: ReactNode;
};

/** A checkbox with a 44px-high clickable row, optional description and error. */
export function Checkbox({ label, description, error, size = "md", trailing, className, wrapperClassName, id, ...props }: CheckboxProps) {
  const generated = useId();
  const inputId = id ?? `c${generated.replace(/:/g, "")}`;
  const descId = `${inputId}-desc`;
  const errorId = `${inputId}-error`;
  const describedBy = [description ? descId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const sm = size === "sm";
  return (
    <div className={wrapperClassName}>
      <label
        htmlFor={inputId}
        className={cn(
          "flex",
          sm
            ? "min-h-8 items-center gap-2.5 rounded-badge py-1 text-small text-ink-muted transition-colors hover:text-ink has-checked:font-semibold has-checked:text-ink pointer-coarse:min-h-11"
            : "min-h-11 items-start gap-3 py-2.5",
        )}
      >
        <span className={cn("relative grid shrink-0 place-items-center", sm ? "size-4" : "mt-0.5 size-5")}>
          <input
            id={inputId}
            type="checkbox"
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className={cn(
              "peer absolute inset-0 size-full appearance-none rounded-badge border border-control bg-surface transition-colors",
              "checked:border-primary checked:bg-primary hover:border-ink-muted aria-invalid:border-danger",
              "disabled:cursor-not-allowed disabled:opacity-50",
              className,
            )}
            {...props}
          />
          <Check
            aria-hidden="true"
            strokeWidth={3}
            className={cn("pointer-events-none relative text-on-primary opacity-0 peer-checked:opacity-100", sm ? "size-3" : "size-3.5")}
          />
        </span>
        {sm ? (
          <span className="min-w-0 flex-1 truncate">{label}</span>
        ) : (
          <span className="min-w-0">
            <span className="block text-body font-medium text-ink">{label}</span>
            {description ? (
              <span id={descId} className="mt-0.5 block text-small text-ink-subtle">
                {description}
              </span>
            ) : null}
          </span>
        )}
        {trailing ? <span className="shrink-0 font-normal text-ink-subtle">{trailing}</span> : null}
      </label>
      <div id={errorId} aria-live="polite">
        {error ? <p className="ps-8 text-small font-medium text-danger-ink">{error}</p> : null}
      </div>
    </div>
  );
}

export type SwitchProps = Omit<ComponentProps<"input">, "type" | "role" | "children"> & {
  /** The visible label. */
  label: ReactNode;
  /** Secondary text under the label. */
  description?: ReactNode;
  /** Classes for the outer label. */
  wrapperClassName?: string;
};

/** An on/off switch (a checkbox with `role="switch"`), label on the start side and the track on the end side. */
export function Switch({ label, description, className, wrapperClassName, id, ...props }: SwitchProps) {
  const generated = useId();
  const inputId = id ?? `s${generated.replace(/:/g, "")}`;
  const descId = `${inputId}-desc`;
  return (
    <label htmlFor={inputId} className={cn("flex min-h-11 items-center justify-between gap-4 py-2", wrapperClassName)}>
      <span className="min-w-0">
        <span className="block text-body font-medium text-ink">{label}</span>
        {description ? (
          <span id={descId} className="mt-0.5 block text-small text-ink-subtle">
            {description}
          </span>
        ) : null}
      </span>
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input
          id={inputId}
          type="checkbox"
          role="switch"
          aria-describedby={description ? descId : undefined}
          className={cn(
            "peer absolute inset-0 size-full appearance-none rounded-full bg-control transition-colors checked:bg-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none relative ms-0.5 size-5 rounded-full bg-surface shadow-card transition-transform duration-(--duration-fast) peer-checked:translate-x-5"
        />
      </span>
    </label>
  );
}
