// Tabs: link-based navigation between views of one page, with the state in the URL (`?status=open`).
// Server-compatible: the caller decides which tab is active from the route or searchParams.
// Motion (owner, 2026-11-15; globals.css "Link tabs"):
// - The underline (or the pill of `variant="pill"`) slides and resizes to the new tab on a client navigation: one
//   indicator in the client nav (tabs-nav.tsx). Before hydration the current tab draws its own underline or pill.
// - Wrap the view the tabs switch (the list, its card) in <TabPanel activeKey>: picking a tab towards the end side brings
//   the new list in from the end side (the start side in Arabic is the right), a few px and a fade, about 200 ms. Each tab
//   link tags its navigation with the direction (`transitionTypes`); a first load, paging, filters, refreshes and the
//   browser's back and forward carry none, so the list swaps at once. The tab row itself never crossfades.
import Link from "next/link";
import { ViewTransition, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TAB_PANEL_ENTER, TAB_PANEL_EXIT, tabTransitionTypes } from "./tabs-indicator";
import { TabsNav } from "./tabs-nav";

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
  const activeIndex = items.findIndex((item) => item.key === activeKey);
  return (
    <TabsNav label={label} variant={variant} className={cn("overflow-x-auto", underline && "border-b border-line", className)}>
      <ul className={cn("flex min-w-max items-center", underline ? "gap-6" : "gap-2")}>
        {items.map((item, index) => (
          <li key={item.key}>
            <Link
              href={item.href}
              prefetch={prefetch}
              transitionTypes={tabTransitionTypes(index, activeIndex)}
              aria-current={index === activeIndex ? "page" : undefined}
              className={cn(
                "tabs-link relative inline-flex min-h-11 min-w-11 items-center justify-center gap-2 whitespace-nowrap text-body",
                "[&_svg]:size-4 [&_svg]:shrink-0",
                underline ? "py-2 font-medium aria-[current=page]:font-bold" : "rounded-full px-4 font-semibold",
              )}
            >
              {item.icon}
              {item.label}
              {item.count !== undefined ? (
                <span className="tabs-count num rounded-full px-1.5 py-0.5 text-caption font-semibold leading-none">{item.count}</span>
              ) : null}
              {/* The current tab's underline until the sliding indicator takes over (and what it measures). */}
              {underline ? <span aria-hidden="true" className="tabs-mark pointer-events-none absolute inset-x-0 -bottom-px h-0.5 rounded-full" /> : null}
            </Link>
          </li>
        ))}
      </ul>
    </TabsNav>
  );
}

export type TabPanelProps = {
  /** The same key as the <Tabs>' `activeKey`: a new key is a new view. */
  activeKey: string;
  /** ONE element: the view the tabs switch (a card, a list). The tab row and the filters stay outside. */
  children: ReactNode;
};

/**
 * The view under link tabs. On a tab click it slides a few px and fades toward the side of the picked tab (a React
 * <ViewTransition> keyed by the tab, `default="none"`: nothing else about it ever animates). Server-compatible.
 */
export function TabPanel({ activeKey, children }: TabPanelProps) {
  return (
    <ViewTransition key={`tab:${activeKey}`} enter={TAB_PANEL_ENTER} exit={TAB_PANEL_EXIT} default="none">
      {children}
    </ViewTransition>
  );
}
