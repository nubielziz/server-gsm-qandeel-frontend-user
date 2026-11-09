// Tabs: link-based navigation between views of one page, with the state in the URL (`?status=open`).
// Server-compatible: the caller decides which tab is active from the route or searchParams.
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TabItem = {
  /** Stable key, compared with `activeKey`. */
  key: string;
  label: ReactNode;
  /** Where the tab goes (a path with its query string, language-prefixed). */
  href: string;
  /** A count shown after the label. */
  count?: number | string;
  /** Icon (lucide element) before the label. */
  icon?: ReactNode;
};

export type TabsProps = {
  /** Accessible name of the navigation (e.g. "Ticket status"). */
  label: string;
  items: TabItem[];
  /** The key of the current tab (`aria-current="page"`). */
  activeKey: string;
  /** `underline` (default, like the Support mockup) or `pill`. */
  variant?: "underline" | "pill";
  /** Passed to every link: set `false` for tabs that should not prefetch. */
  prefetch?: boolean;
  className?: string;
};

/** Link tabs. The list scrolls sideways on narrow screens instead of wrapping. */
export function Tabs({ label, items, activeKey, variant = "underline", prefetch, className }: TabsProps) {
  const underline = variant === "underline";
  return (
    <nav aria-label={label} className={cn("overflow-x-auto", underline && "border-b border-line", className)}>
      <ul className={cn("flex min-w-max items-center", underline ? "gap-6" : "gap-2")}>
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                prefetch={prefetch}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex min-h-11 min-w-11 items-center justify-center gap-2 whitespace-nowrap text-body transition-colors duration-(--duration-fast)",
                  "[&_svg]:size-4 [&_svg]:shrink-0",
                  underline
                    ? "py-2 font-medium text-ink-muted hover:text-ink aria-[current=page]:font-bold aria-[current=page]:text-ink " +
                        "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent aria-[current=page]:after:bg-ink"
                    : "rounded-full px-4 font-semibold text-ink-muted hover:bg-surface-sunken hover:text-ink aria-[current=page]:bg-inverse aria-[current=page]:text-on-inverse",
                )}
              >
                {item.icon}
                {item.label}
                {item.count !== undefined ? (
                  <span
                    className={cn(
                      "num rounded-full px-1.5 py-0.5 text-caption font-semibold leading-none",
                      active && !underline ? "bg-inverse-raised text-on-inverse" : "bg-surface-sunken text-ink-muted",
                    )}
                  >
                    {item.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
