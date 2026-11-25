// ProgressBar: a single value bar, or a stacked bar of segments (the shares of a total).
import { cn } from "@/lib/cn";

export type ProgressTone = "ink" | "success" | "warning" | "danger" | "neutral";

const toneClasses: Record<ProgressTone, string> = {
  ink: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-control",
};

export type ProgressSegment = { value: number; tone: ProgressTone };

export type ProgressBarProps = {
  /** Accessible name ("Completed orders"). */
  label: string;
  /** Single-bar value (0..max). Ignored when `segments` is set. */
  value?: number;
  max?: number;
  tone?: ProgressTone;
  /** A stacked bar: each segment's width is its share of the sum of all segment values. */
  segments?: ProgressSegment[];
  className?: string;
};

/** A thin rounded bar. A single bar is a `progressbar`; a stacked one is an image labelled by `label` (list the numbers next to it). */
export function ProgressBar({ label, value = 0, max = 100, tone = "ink", segments, className }: ProgressBarProps) {
  if (segments) {
    const sum = segments.reduce((n, s) => n + s.value, 0) || 1;
    return (
      <div role="img" aria-label={label} className={cn("flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-surface-sunken", className)}>
        {segments
          .filter((s) => s.value > 0)
          .map((s, i) => (
            <span key={i} className={cn("h-full", toneClasses[s.tone])} style={{ width: `${(s.value / sum) * 100}%` }} />
          ))}
      </div>
    );
  }
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-sunken", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-(--duration-base)", toneClasses[tone])} style={{ width: `${percent}%` }} />
    </div>
  );
}
