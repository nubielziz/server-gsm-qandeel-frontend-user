// The look of the workspace navigation, as pure markup (no hooks) so the server can render a fallback without an
// active item while the client version reads the pathname. See workspace-nav.tsx.
// Three looks: the desktop rail (icons with a tooltip), the drawer (labelled rows) and the phone tab bar (icons with a
// short label). The rail and the tab bar sit in a SlidingNav (sliding-nav.tsx): before it takes over (server HTML, no
// JavaScript) the active link draws its own selected look from CSS (globals.css "Workspace rail and tab bar").
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { isActivePath } from "./active-path";

export type WorkspaceNavItem = {
  /** Language-prefixed path. */
  href: string;
  /** Short name: the rail tooltip, the drawer row and the breadcrumb. */
  label: string;
  /** A shorter name for the phone tab bar (defaults to `label`). */
  shortLabel?: string;
  /** The icon (a lucide element, e.g. `<LayoutDashboard aria-hidden="true" />`). */
  icon: ReactNode;
  /** Longer page title for the header card (defaults to `label`). */
  title?: string;
  /** `prefix` (default) is active for the page and everything below it; `exact` only for the page itself. */
  match?: "exact" | "prefix";
  /**
   * Holds the item's place without showing it: an empty slot of the same size, hidden from assistive technology. For an
   * item that depends on the session (the customer's wallet): the static shell reserves the place, and the list read
   * after the session either shows the item or drops the slot, so a likely item does not push the ones below it down.
   * The item still names its page for the header title.
   */
  reserve?: boolean;
  /**
   * A live badge (the unread count, the support dot, the orders in progress: components/layout/workspace-badges.tsx). It
   * streams in its own <Suspense> and adds its words to the link's accessible name ("Notifications, 3 unread"). The rail
   * and the tab bar lay it over the icon's corner and the drawer at the row's end, so it never moves anything.
   */
  badge?: ReactNode;
};

export type WorkspaceNavViewProps = {
  items: WorkspaceNavItem[];
  /** The current pathname, or null for "none active". */
  pathname: string | null;
  /** `rail` = icon buttons with tooltips on the dark rail; `drawer` = labelled rows; `tabs` = the phone tab bar. */
  variant: "rail" | "drawer" | "tabs";
};

/** A list of nav links in the rail, drawer or tab bar look, marking the one that matches `pathname`. */
export function WorkspaceNavView({ items, pathname, variant }: WorkspaceNavViewProps) {
  const current = (item: WorkspaceNavItem) => (isActivePath(pathname, item.href, item.match) ? "page" : undefined);

  if (variant === "drawer") {
    return (
      <ul className="grid gap-1">
        {items.map((item) => {
          if (item.reserve) {
            return (
              <li key={item.href} aria-hidden="true">
                <span className="block min-h-12" />
              </li>
            );
          }
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current(item)}
                className={cn(
                  "drawer-link flex min-h-12 items-center gap-3 rounded-control px-3 text-body font-semibold text-ink-muted transition-colors",
                  "hover:bg-surface-muted hover:text-ink aria-[current=page]:bg-inverse aria-[current=page]:text-on-inverse",
                  "[&_svg]:size-5 [&_svg]:shrink-0",
                )}
              >
                {item.icon}
                {item.label}
                {item.badge ? <span className="ms-auto inline-flex">{item.badge}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  if (variant === "tabs") {
    // Equal columns: the indicator slides between same-size pills. 44px+ touch targets (the whole column is the link).
    return (
      <ul className="mx-auto grid max-w-xl auto-cols-fr grid-flow-col px-1">
        {items.map((item) => {
          if (item.reserve) {
            return (
              <li key={item.href} aria-hidden="true">
                <span className="block h-(--ws-tabbar-h)" />
              </li>
            );
          }
          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                aria-current={current(item)}
                className="tab-link relative flex h-(--ws-tabbar-h) min-w-0 flex-col items-center justify-center gap-1 px-1 text-caption font-semibold"
              >
                <span className="tab-icon relative grid h-8 w-14 place-items-center rounded-full [&_svg]:size-5">{item.icon}</span>
                <span className="max-w-full truncate">{item.shortLabel ?? item.label}</span>
                {/* After the label in the DOM so the name reads "Orders, 3 in progress"; drawn at the icon's top end corner. */}
                {item.badge ? (
                  <span className="absolute top-[calc(50%-1.75rem)] start-[calc(50%+0.875rem)] inline-flex">{item.badge}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  // Short screens (under 46rem, where the rail also drops its avatar): 44px buttons and tighter gaps; under 41rem 40px and
  // tighter still (the merchant has eleven links since feature 28's Support), so the merchant's
  // links fit a 1366×768 laptop window without the rail growing past the screen.
  return (
    <ul className="grid justify-items-center gap-2 [@media(max-height:46rem)]:gap-1 [@media(max-height:41rem)]:gap-0.5!">
      {items.map((item) => {
        if (item.reserve) {
          return (
            <li key={item.href} aria-hidden="true">
              <span className="block size-12 [@media(max-height:46rem)]:size-11 [@media(max-height:41rem)]:size-10!" />
            </li>
          );
        }
        return (
          <li key={item.href} className="relative">
            <Link
              href={item.href}
              aria-current={current(item)}
              className="rail-link relative grid size-12 place-items-center rounded-control [@media(max-height:46rem)]:size-11 [@media(max-height:41rem)]:size-10! [&_svg]:size-6"
            >
              {item.icon}
              <span className="sr-only">{item.label}</span>
              {item.badge ? <span className="absolute end-1 top-1 inline-flex">{item.badge}</span> : null}
              {/* The active mark on the rail's edge before the sliding indicator takes over (CSS only, globals.css). */}
              <span aria-hidden="true" className="rail-mark" />
              {/* Tooltip on hover (not on touch) and keyboard focus, beside the rail on the end side. Visual only: the
                  sr-only label above (and the badge's words) are the accessible name. */}
              <span aria-hidden="true" className="rail-tip">
                {item.label}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
