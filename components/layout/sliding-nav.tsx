"use client";
// SlidingNav: a <nav> of the workspace (the desktop rail, the phone tab bar) with ONE selection indicator that slides to
// the current page's link on a client navigation (owner, 2026-11-15; the technique of the shop's nav row, nav-row.tsx).
// - The indicator is this component's own element, measured from the link with `aria-current="page"` (or, with `target`,
//   from an element inside that link: the tab bar's icon pill). It moves with a CSS transition on `translate` only
//   (globals.css `.ws-indicator`, --duration-slow, --ease-glide); its size is set at once (every link of one list has
//   the same size). Geometry and the slide-or-jump rule: sliding-indicator.ts.
// - First placement, resizes and a list that resolves its active link after hydration jump; only a change of the current
//   link with a new pathname slides. Reduced motion: the global rule makes the transition instant.
// - Before this script runs (server HTML, no JavaScript) the active link draws its own selected look (globals.css), and
//   `data-indicator` on this nav (React state, never an attribute written from an effect) hands the look over to the
//   indicator. Never write attributes or classes on the links: they render inside other <Suspense> boundaries and an
//   attribute React did not render is a hydration mismatch (the lesson of nav-row.tsx).
// - Placed from physical offsets (`translate` in px) relative to the nav. The caller positions the nav (`relative`, `fixed`).
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { boxWithin, nextMove, translateOf, type Box } from "./sliding-indicator";

const CURRENT = 'a[aria-current="page"]';

export type SlidingNavProps = {
  /** The nav landmark's accessible name. */
  label: string;
  /** Classes of the nav; it must be positioned (the indicator is absolute inside it). */
  className?: string;
  /** Classes of the indicator (globals.css: `ws-indicator` plus the look, `ws-rail-indicator` / `ws-tab-indicator`). */
  indicatorClassName: string;
  /** A selector inside the current link to measure instead of the link itself (the tab bar's `.tab-icon`). */
  target?: string;
  /** The nav's lists (server-rendered, each in its own <Suspense>). */
  children: ReactNode;
};

/** A nav landmark whose selection indicator slides between its links. Render it once per list area. */
export function SlidingNav({ label, className, indicatorClassName, target, children }: SlidingNavProps) {
  const navRef = useRef<HTMLElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const [placed, setPlaced] = useState(false);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const mark = markRef.current;
    if (!nav || !mark) return;
    let last: { el: HTMLElement; box: Box } | null = null;
    let path = window.location.pathname;

    const selected = (): HTMLElement | null => {
      const link = nav.querySelector<HTMLElement>(CURRENT);
      if (!link) return null;
      return (target ? link.querySelector<HTMLElement>(target) : null) ?? link;
    };
    const measure = (el: HTMLElement): Box =>
      boxWithin(el.getBoundingClientRect(), nav.getBoundingClientRect(), { left: nav.clientLeft, top: nav.clientTop });
    const draw = (box: Box) => {
      mark.style.width = `${box.w}px`;
      mark.style.height = `${box.h}px`;
      mark.style.translate = translateOf(box);
    };

    const place = (navigated: boolean) => {
      const el = selected();
      // Hidden (the rail below `lg`, the tab bar from `lg`): nothing to measure. The ResizeObserver places it when it shows.
      if (el && el.offsetWidth === 0) return;
      const next = el ? { el, box: measure(el) } : null;
      const move = nextMove(last, next, navigated);
      if (move === "stay") return;
      if (move === "hide" || !next) {
        mark.style.opacity = "0";
        last = null;
        return;
      }
      if (move === "jump") {
        mark.style.transition = "none";
        draw(next.box);
        mark.style.opacity = "1";
        void mark.offsetWidth; // apply the jump before the transition is back
        mark.style.transition = "";
      } else {
        // The style is live: a slide that starts mid-slide (a fast second click) continues from where it is.
        draw(next.box);
      }
      last = next;
    };

    const sizes = new ResizeObserver(() => place(false));
    const observeSizes = () => {
      sizes.disconnect();
      sizes.observe(nav);
      for (const el of nav.querySelectorAll<HTMLElement>("a[href]")) sizes.observe(el);
    };
    // A link's `aria-current` changes on a navigation; a list is replaced when its <Suspense> resolves.
    const changes = new MutationObserver(() => {
      const now = window.location.pathname;
      const navigated = now !== path;
      path = now;
      observeSizes();
      place(navigated);
    });

    place(false);
    setPlaced(true);
    observeSizes();
    changes.observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-current"] });
    return () => {
      changes.disconnect();
      sizes.disconnect();
      setPlaced(false);
    };
  }, [target]);

  return (
    <nav ref={navRef} aria-label={label} data-indicator={placed ? "" : undefined} className={className}>
      {/* First in the nav: the links (positioned list items) paint above it. */}
      <span ref={markRef} aria-hidden="true" className={cn("ws-indicator", indicatorClassName)} />
      {children}
    </nav>
  );
}
