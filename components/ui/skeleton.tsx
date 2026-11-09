// Skeleton: placeholder blocks for content that is still loading. Give them the SAME size as the real content so that
// nothing moves when it arrives. Decorative: hidden from screen readers (announce loading with a status region).
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** A rounded grey block with a light sweep. Defaults to a full-width 16px bar; size it with `className` (`h-4 w-32`, `size-11 rounded-full` …). */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden="true" className={cn("skeleton", className)} {...props} />;
}

export type SkeletonTextProps = {
  /** Number of lines (default 3). The last one is shorter. */
  lines?: number;
  className?: string;
};

/** A paragraph of skeleton lines (15px text, 24px line height). */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div aria-hidden="true" className={cn("grid gap-2.5", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 && lines > 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}
