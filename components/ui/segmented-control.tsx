"use client";
// SegmentedControl: a small radio group drawn as joined buttons (period filters, view switches). Follows the WAI-ARIA
// radio group pattern: one tab stop, arrow keys move AND select, Home/End jump.
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SegmentedOption = {
  value: string;
  label: ReactNode;
  /** Icon (lucide element) before the label. */
  icon?: ReactNode;
  disabled?: boolean;
};

export type SegmentedControlProps = {
  /** Accessible name of the group (what is being chosen). */
  label: string;
  options: SegmentedOption[];
  /** Controlled value. */
  value?: string;
  /** Initial value when uncontrolled (defaults to the first enabled option). */
  defaultValue?: string;
  /** Called with the new value. */
  onValueChange?: (value: string) => void;
  /** When set, a hidden input with this name submits the value with a form. */
  name?: string;
  size?: "sm" | "md";
  /** Stretches the control and shares the width equally. */
  fullWidth?: boolean;
  className?: string;
};

/** A radio group drawn as segmented buttons: keyboard arrows, roving tab stop. */
export function SegmentedControl({
  label,
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  size = "md",
  fullWidth,
  className,
}: SegmentedControlProps) {
  const groupId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [inner, setInner] = useState(defaultValue ?? options.find((o) => !o.disabled)?.value ?? "");
  const current = value ?? inner;

  function select(next: string) {
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let step = 0;
    if (event.key === "ArrowRight") step = 1;
    else if (event.key === "ArrowLeft") step = -1;
    else if (event.key === "ArrowDown") step = 1;
    else if (event.key === "ArrowUp") step = -1;
    else if (event.key === "Home" || event.key === "End") step = 0;
    else return;
    event.preventDefault();

    const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
    if (enabled.length === 0) return;
    let target: number;
    if (event.key === "Home") target = enabled[0];
    else if (event.key === "End") target = enabled[enabled.length - 1];
    else {
      const at = enabled.indexOf(index);
      target = enabled[(at + step + enabled.length) % enabled.length];
    }
    refs.current[target]?.focus();
    select(options[target].value);
  }

  // Exactly one radio is in the tab order: the checked one (or the first enabled if the value matches nothing).
  const tabbable = options.some((o) => o.value === current && !o.disabled)
    ? current
    : options.find((o) => !o.disabled)?.value;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex gap-1 rounded-control bg-surface-sunken p-1",
        fullWidth && "flex w-full",
        className,
      )}
    >
      {name ? <input type="hidden" name={name} value={current} /> : null}
      {options.map((option, index) => {
        const checked = option.value === current;
        return (
          <button
            key={option.value}
            id={`${groupId}-${index}`}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={option.disabled}
            tabIndex={option.value === tabbable ? 0 : -1}
            onClick={() => select(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] font-semibold transition-colors duration-(--duration-fast) ease-standard",
              "disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
              size === "sm" ? "h-9 px-3 text-small" : "h-10 px-4 text-body",
              fullWidth && "flex-1",
              checked ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
