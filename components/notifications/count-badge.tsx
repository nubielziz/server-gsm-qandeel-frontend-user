// The number badge of the bell and of the workspace navigation's Notifications item (owner, 2026-11-15): the count with
// its pop and its rolling number, played from a `BellView` (lib/notifications/bell-motion.ts, `useBellMotion`). Pure
// markup, decoration only: it is aria-hidden, the caller names the count in words. Server-compatible.
import { cn } from "@/lib/cn";
import type { BellView } from "@/lib/notifications/bell-motion";

export type CountBadgeProps = {
  /** What the badge plays now. */
  view: BellView;
  /** The text on the badge ("3", "99+"). */
  text: string;
  /** The badge's place and look (position, size, colours). */
  className: string;
};

/** The badge: pops (`view.pop`, restarted by `popKey`) and rolls the number (`view.roll`, restarted by `rollKey`). */
export function CountBadge({ view, text, className }: CountBadgeProps) {
  return (
    <span
      key={view.popKey}
      aria-hidden="true"
      dir="ltr"
      className={cn(
        "num overflow-hidden",
        className,
        view.pop === "pop" && "motion-safe:animate-badge-pop",
        view.pop === "in" && "motion-safe:animate-badge-in",
      )}
    >
      {/* The leaving number is laid over the badge (absolute), so only the new number sizes it: no width jump. It is
          invisible at rest, so it shows only while its animation runs. */}
      {view.roll ? (
        <span
          key={`out-${view.rollKey}`}
          className={cn(
            "absolute inset-0 flex items-center justify-center opacity-0",
            view.roll.up ? "motion-safe:animate-count-out-up" : "motion-safe:animate-count-out-down",
          )}
        >
          {view.roll.from}
        </span>
      ) : null}
      <span
        key={view.rollKey}
        className={cn("inline-block", view.roll && (view.roll.up ? "motion-safe:animate-count-in-up" : "motion-safe:animate-count-in-down"))}
      >
        {text}
      </span>
    </span>
  );
}
