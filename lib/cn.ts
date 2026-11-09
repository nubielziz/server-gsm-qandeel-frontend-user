// A tiny class-name joiner: keeps non-empty strings, drops false / null / undefined / 0 / "" (so `cond && "class"` works,
// also when `cond` is a ReactNode). No Tailwind class merging:
// a component's base classes and a caller's `className` must not fight over the same property: components expose props
// (`pill`, `size`, `tone` …) for what can change, and `className` is for layout only (margins, grid placement).
// Safe to import anywhere.

export type ClassValue = string | number | bigint | false | null | undefined;

/** `cn("px-4", isActive && "bg-inverse", props.className)` → space-joined classes without the falsy parts. */
export function cn(...values: ClassValue[]): string {
  let out = "";
  for (const value of values) {
    if (typeof value === "string" && value) out += out ? ` ${value}` : value;
  }
  return out;
}
