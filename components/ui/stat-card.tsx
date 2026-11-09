// StatCard: an icon, a label and one big number (orders, balance, invoices …). `inverse` is the dark balance card.
import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Card } from "./card";

export type StatCardProps = {
  /** What is counted (e.g. "Total orders"). */
  label: ReactNode;
  /** The figure: text, a number, or `<Money />`. */
  value: ReactNode;
  /** Small line under the figure (e.g. "All service requests"). */
  hint?: ReactNode;
  /** Outline icon (lucide element). */
  icon?: ReactNode;
  /** `inverse` renders the dark hero variant with a larger figure. */
  tone?: "default" | "inverse";
  /** Makes the whole card a link. */
  href?: string;
  /** Extra content under the figure (buttons on the dark balance card). */
  children?: ReactNode;
  className?: string;
};

/** A statistic tile: label, big tabular figure, hint and an optional icon / link / actions. */
export function StatCard({ label, value, hint, icon, tone = "default", href, children, className }: StatCardProps) {
  const inverse = tone === "inverse";
  const body = (
    <div className={cn("flex items-start gap-4", inverse ? "p-6 sm:p-7" : "p-5")}>
      {icon ? (
        <span
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-card [&_svg]:size-6",
            inverse ? "bg-inverse-raised text-on-inverse" : "bg-surface-muted text-ink",
          )}
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className={cn("text-body font-semibold", inverse ? "text-on-inverse-muted" : "text-ink")}>{label}</p>
        <p className={cn("mt-1 num text-stat", inverse && "mt-2")}>{value}</p>
        {hint ? <p className={cn("mt-1 text-small", inverse ? "text-on-inverse-muted" : "text-ink-subtle")}>{hint}</p> : null}
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </div>
  );
  if (href) {
    return (
      <Card tone={tone} className={cn("transition-shadow hover:shadow-raised", className)}>
        <Link href={href} className="block rounded-[inherit]">
          {body}
        </Link>
      </Card>
    );
  }
  return (
    <Card tone={tone} className={className}>
      {body}
    </Card>
  );
}
