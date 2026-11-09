// Divider: a hairline, optionally with a centred label ("or continue with").
import { cn } from "@/lib/cn";

export type DividerProps = {
  /** Text in the middle of a horizontal divider. */
  label?: string;
  orientation?: "horizontal" | "vertical";
  className?: string;
};

/** A 1px separator line. `vertical` needs a parent with a height (it stretches). */
export function Divider({ label, orientation = "horizontal", className }: DividerProps) {
  if (orientation === "vertical") {
    return <div role="separator" aria-orientation="vertical" className={cn("w-px self-stretch bg-line", className)} />;
  }
  if (label) {
    return (
      <div role="separator" className={cn("flex items-center gap-4 text-small text-ink-subtle", className)}>
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
        <span>{label}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
      </div>
    );
  }
  return <hr className={cn("h-px border-0 bg-line", className)} />;
}
