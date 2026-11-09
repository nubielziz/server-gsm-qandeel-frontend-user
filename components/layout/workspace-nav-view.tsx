// The look of the workspace navigation, as pure markup (no hooks) so the server can render a fallback without an
// active item while the client version reads the pathname. See workspace-nav.tsx.
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { isActivePath } from "./active-path";

export type WorkspaceNavItem = {
  /** Language-prefixed path. */
  href: string;
  /** Short name: the rail tooltip, the drawer row and the breadcrumb. */
  label: string;
  /** The icon (a lucide element, e.g. `<LayoutDashboard aria-hidden="true" />`). */
  icon: ReactNode;
  /** Longer page title for the header card (defaults to `label`). */
  title?: string;
  /** `prefix` (default) is active for the page and everything below it; `exact` only for the page itself. */
  match?: "exact" | "prefix";
};

export type WorkspaceNavViewProps = {
  items: WorkspaceNavItem[];
  /** The current pathname, or null for "none active". */
  pathname: string | null;
  /** `rail` = icon buttons with tooltips on the dark rail; `drawer` = labelled rows. */
  variant: "rail" | "drawer";
};

/** A list of nav links in the rail or drawer look, marking the one that matches `pathname`. */
export function WorkspaceNavView({ items, pathname, variant }: WorkspaceNavViewProps) {
  if (variant === "drawer") {
    return (
      <ul className="grid gap-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActivePath(pathname, item.href, item.match) ? "page" : undefined}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-control px-3 text-body font-semibold text-ink-muted transition-colors",
                "hover:bg-surface-muted hover:text-ink aria-[current=page]:bg-inverse aria-[current=page]:text-on-inverse",
                "[&_svg]:size-5 [&_svg]:shrink-0",
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="grid justify-items-center gap-2">
      {items.map((item) => (
        <li key={item.href} className="relative">
          <Link
            href={item.href}
            aria-current={isActivePath(pathname, item.href, item.match) ? "page" : undefined}
            className={cn(
              "group relative grid size-12 place-items-center rounded-control text-on-inverse-muted transition-colors duration-(--duration-fast)",
              "hover:bg-inverse-raised hover:text-on-inverse aria-[current=page]:bg-inverse-raised aria-[current=page]:text-on-inverse",
              "[&_svg]:size-6",
            )}
          >
            {item.icon}
            <span className="sr-only">{item.label}</span>
            {/* Active mark on the rail's inner edge, as in the mockups. */}
            <span
              aria-hidden="true"
              className="absolute -start-4 h-7 w-1 rounded-e-full bg-on-inverse opacity-0 group-aria-[current=page]:opacity-100"
            />
            {/* Tooltip: hover and keyboard focus. Decorative: the sr-only label above is the accessible name. */}
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute start-full z-50 ms-4 whitespace-nowrap rounded-control bg-surface px-3 py-2 text-small font-semibold text-ink opacity-0 shadow-overlay",
                "transition-opacity duration-(--duration-fast) group-hover:opacity-100 group-focus-visible:opacity-100",
              )}
            >
              {item.label}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
