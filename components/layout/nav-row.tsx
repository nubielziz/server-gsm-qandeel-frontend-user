"use client";
// NavRow: the desktop nav row of the shop header and its one black pill. The pill sits behind the selected link: the
// current page's (`aria-current="page"`, set by NavLink) or, on pages without one such as the home page, the row's
// default link (`data-nav-default`, "All services"). On a client navigation it slides and resizes to the new link
// (a CSS transition on `translate` and `width`, globals.css `.nav-pill`), and the links' text turns white or grey when
// the pill covers half of them (`data-pill-on`, timing in nav-pill-timing.ts), so the colour follows the slide.
// - First placement, resizes and font loading: the pill jumps (no slide on page load). Only a change of the current
//   link with a new address (pathname or query: "All services" to "IMEI services" is the same path) slides; a link that
//   resolves its active mark after hydration (NavLink's <Suspense>) jumps.
// - Before this script runs (server HTML, no JavaScript) the selected link draws the black box itself (globals.css),
//   so nothing moves when the pill takes over.
// - Measured with offsetLeft/offsetWidth relative to the row, which are physical px. The
//   "All categories" menu button is a row item like the links; it is never selected.
// - Not a React <ViewTransition>: a named view transition is drawn above the page and would hide the labels while
//   it moves. Reduced motion: the global rule makes the transition instant and the colours switch at once.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Container } from "./container";
import { colourSwitch, firstBezier, firstTimeMs, type Span } from "./nav-pill-timing";

const CURRENT = 'a.nav-item[aria-current="page"]';
const DEFAULT = ".nav-item[data-nav-default]";
/** The href of a nav link: the key of the "covered" state (a link is replaced when its <Suspense> resolves, its href stays). */
const hrefOf = (el: HTMLElement) => el.getAttribute("href") ?? "";
/** A CSS string literal for an attribute selector. */
const cssString = (value: string) => `"${value.replace(/["\\]/g, "\\$&")}"`;

type Box = { x: number; y: number; w: number; h: number };

const boxOf = (el: HTMLElement): Box => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
const sameBox = (a: Box, b: Box) =>
  Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;
const px = (value: string, fallback: number) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};

export type NavRowProps = {
  /** The row's links (NavLink with the `nav-item` class; one of them `data-nav-default`) and the category menu. */
  children: ReactNode;
  className?: string;
};

/** The desktop nav row with the sliding pill. Render it once per header; it needs no state from its parent. */
export function NavRow({ children, className }: NavRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  // Never write attributes on the links themselves: they sit in <Suspense> boundaries (NavLink) that may hydrate after
  // this effect, and an attribute React did not render is a hydration mismatch. The row's own state says which links the
  // pill covers (white text, rendered as a <style> rule below) and whether the pill has taken over (`data-pill`).
  const [placed, setPlaced] = useState(false);
  const [covered, setCovered] = useState<readonly string[]>([]);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const pill = pillRef.current;
    if (!row || !pill) return;
    let timers: number[] = [];
    let last: { link: HTMLElement; box: Box } | null = null;
    // The address the row last saw: the query counts, the catalog's type links differ from "All services" by it alone.
    // A query change that leaves the current link (and its box) as it was is a no-op in place().
    const address = () => window.location.pathname + window.location.search;
    let path = address();
    const on = new Set<string>();
    const commit = () => setCovered([...on]);

    const cancel = () => {
      for (const timer of timers) window.clearTimeout(timer);
      timers = [];
    };
    const target = () => row.querySelector<HTMLElement>(CURRENT) ?? row.querySelector<HTMLElement>(DEFAULT);
    const lit = () => Array.from(row.querySelectorAll<HTMLElement>("a.nav-item")).filter((el) => on.has(hrefOf(el)));
    const light = (link: HTMLElement) => {
      on.clear();
      on.add(hrefOf(link));
      commit();
    };
    const darken = (el: HTMLElement) => {
      on.delete(hrefOf(el));
      commit();
    };
    const draw = (box: Box) => {
      pill.style.width = `${box.w}px`;
      pill.style.height = `${box.h}px`;
      pill.style.translate = `${box.x}px ${box.y}px`;
    };

    /** Puts the pill on the selected link: a slide (`slide`, after a navigation) or a jump (first placement, resizes). */
    const place = (slide: boolean) => {
      const link = target();
      // Hidden (below `lg`, or a previous page Next keeps hidden in the DOM): nothing to measure. The ResizeObserver
      // places it when it shows.
      if (!link || link.offsetWidth === 0) return;
      const box = boxOf(link);
      if (last && last.link === link && sameBox(last.box, box)) return;
      cancel();
      if (!slide || !last) {
        pill.style.transition = "none";
        draw(box);
        void pill.offsetWidth; // apply the jump before the transition is back
        pill.style.transition = "";
        light(link);
      } else {
        // Read where the pill is now (mid-slide when the visitor clicks fast) before moving it: the style object is live.
        const style = getComputedStyle(pill);
        const from: Span = { start: px(style.translate, last.box.x), width: px(style.width, last.box.w) };
        const duration = firstTimeMs(style.transitionDuration);
        const easing = firstBezier(style.transitionTimingFunction);
        draw(box);
        if (duration < 1) {
          light(link);
        } else {
          const to: Span = { start: box.x, width: box.w };
          // The colour flip is centred on the moment: it starts half a colour transition earlier.
          const lead = firstTimeMs(getComputedStyle(link).transitionDuration) / 2;
          const at = (ms: number, run: () => void) => timers.push(window.setTimeout(run, Math.max(0, ms - lead)));
          for (const el of lit()) {
            if (el === link) continue;
            const { leaveAt } = colourSwitch(from, to, { start: el.offsetLeft, width: el.offsetWidth }, duration, easing);
            at(leaveAt, () => darken(el));
          }
          if (!on.has(hrefOf(link))) {
            at(colourSwitch(from, to, null, duration, easing).arriveAt, () => {
              on.add(hrefOf(link));
              commit();
            });
          }
        }
      }
      last = { link, box };
    };

    const sizes = new ResizeObserver(() => place(false));
    const observeSizes = () => {
      sizes.disconnect();
      sizes.observe(row);
      for (const el of row.querySelectorAll<HTMLElement>(".nav-item")) sizes.observe(el);
    };
    // A NavLink's `aria-current` changes on a navigation; a link is replaced when its <Suspense> resolves.
    const changes = new MutationObserver(() => {
      const next = address();
      const navigated = next !== path;
      path = next;
      observeSizes();
      place(navigated);
    });

    place(false);
    setPlaced(true);
    observeSizes();
    changes.observe(row, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-current"] });
    return () => {
      changes.disconnect();
      sizes.disconnect();
      cancel();
      setPlaced(false);
    };
  }, []);

  return (
    <Container
      ref={rowRef}
      width="wide"
      data-pill={placed ? "" : undefined}
      className={cn("nav-row relative flex h-14 items-center gap-1", className)}
    >
      {covered.length > 0 ? (
        // The links the pill covers get white text (the specificity beats the hover grey). Nothing is rendered on the
        // server or before the pill is placed, so hydration sees the same markup.
        <style>{`.nav-row[data-pill] a.nav-item.nav-item:is(${covered.map((href) => `[href=${cssString(href)}]`).join(",")}){color:var(--color-on-primary);background-color:transparent;transition-property:color}`}</style>
      ) : null}
      <span ref={pillRef} aria-hidden="true" className="nav-pill" />
      {children}
    </Container>
  );
}
