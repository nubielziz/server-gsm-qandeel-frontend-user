"use client";
// TabsNav: the <nav> of link tabs (components/ui/tabs.tsx) with ONE indicator that slides and resizes to the current tab on
// a client navigation (owner, 2026-11-15; the technique of the workspace rail, components/layout/sliding-nav.tsx, and of
// the shop's nav row, nav-row.tsx).
// - The indicator is this component's own element, measured from the link with `aria-current="page"`: its `.tabs-mark`
//   (the underline under the label) or, for `variant="pill"`, the link itself. It is three pieces moved with `translate`
//   and `scale` only (geometry: tabs-indicator.ts), on --duration-slow and --ease-glide (globals.css "Link tabs").
// - First placement, resizes, font loading and a list that resolves after hydration jump; only a change of the current
//   tab together with a new URL (path or query: tabs live in `?status=`) slides. Reduced motion: the global rule makes the
//   transition instant.
// - Before this script runs (server HTML, no JavaScript) the current tab draws its own underline or pill (globals.css),
//   and `data-indicator` on this nav (React state, never an attribute written from an effect) hands the look over to the
//   indicator. Never write attributes or classes on the links: a page may render them inside other <Suspense> boundaries,
//   and an attribute React did not render is a hydration mismatch (the lesson of nav-row.tsx). The pill's white text
//   follows the slide through a <style> rule this nav renders itself (the links it covers, by href, timed with
//   nav-pill-timing.ts), switched when the pill covers half of a link.
// - Placed from physical offsets in the nav's content box (`translate` in px); the nav scrolls sideways on narrow screens and the indicator scrolls with the links.
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { colourSwitch, firstBezier, firstTimeMs, type Span } from "@/components/layout/nav-pill-timing";
import { nextMove, type Box } from "@/components/layout/sliding-indicator";
import { boxInScroller, firstPx, piecesOf, spanFromCaps } from "./tabs-indicator";

const CURRENT = 'a.tabs-link[aria-current="page"]';
const hrefOf = (el: HTMLElement) => el.getAttribute("href") ?? "";
/** A CSS string literal for an attribute selector. */
const cssString = (value: string) => `"${value.replace(/["\\]/g, "\\$&")}"`;
const here = () => `${window.location.pathname}${window.location.search}`;

export type TabsNavProps = {
  /** The nav landmark's accessible name. */
  label: string;
  variant: "underline" | "pill";
  className?: string;
  /** The tab list (server-rendered links with the `tabs-link` class). */
  children: ReactNode;
};

/** The nav landmark of link tabs with the sliding indicator. Render it through <Tabs>. */
export function TabsNav({ label, variant, className, children }: TabsNavProps) {
  const id = useId();
  const navRef = useRef<HTMLElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const startRef = useRef<HTMLSpanElement>(null);
  const middleRef = useRef<HTMLSpanElement>(null);
  const endRef = useRef<HTMLSpanElement>(null);
  const [placed, setPlaced] = useState(false);
  // The links the pill covers (white text), by href. Only the pill variant uses it.
  const [covered, setCovered] = useState<readonly string[]>([]);
  const pill = variant === "pill";

  useLayoutEffect(() => {
    const nav = navRef.current;
    const mark = markRef.current;
    const start = startRef.current;
    const middle = middleRef.current;
    const end = endRef.current;
    if (!nav || !mark || !start || !middle || !end) return;
    const pieces = [start, middle, end];
    let last: { el: HTMLElement; box: Box } | null = null;
    let url = here();
    let timers: number[] = [];
    const on = new Set<string>();
    const commit = () => setCovered([...on]);

    const cancel = () => {
      for (const timer of timers) window.clearTimeout(timer);
      timers = [];
    };
    /** The current link and the element the indicator matches (the underline mark, or the link for the pill). */
    const selected = () => {
      const link = nav.querySelector<HTMLElement>(CURRENT);
      if (!link) return null;
      return { link, el: (pill ? null : link.querySelector<HTMLElement>(".tabs-mark")) ?? link };
    };
    const measure = (el: HTMLElement): Box => boxInScroller(el.getBoundingClientRect(), nav.getBoundingClientRect(), nav);
    const draw = (box: Box) => {
      const p = piecesOf(box);
      for (const piece of pieces) piece.style.height = `${p.height}px`;
      start.style.width = `${p.cap}px`;
      end.style.width = `${p.cap}px`;
      start.style.translate = `${p.start.x}px ${p.start.y}px`;
      middle.style.translate = `${p.middle.x}px ${p.middle.y}px`;
      middle.style.scale = `${p.middle.scale} 1`;
      end.style.translate = `${p.end.x}px ${p.end.y}px`;
    };
    const instantly = (run: () => void) => {
      for (const piece of pieces) piece.style.transition = "none";
      run();
      void mark.offsetWidth; // apply the jump before the transition is back
      for (const piece of pieces) piece.style.transition = "";
    };
    const light = (link: HTMLElement) => {
      if (!pill) return;
      on.clear();
      on.add(hrefOf(link));
      commit();
    };

    const place = (navigated: boolean) => {
      const current = selected();
      // Hidden (a page Next keeps hidden in the DOM, a closed panel): nothing to measure. The ResizeObserver places it when
      // it shows.
      if (current && current.link.offsetWidth === 0) return;
      const next = current ? { el: current.el, box: measure(current.el) } : null;
      const move = nextMove(last, next, navigated);
      if (move === "stay") return;
      cancel();
      if (move === "hide" || !next || !current) {
        mark.style.opacity = "0";
        last = null;
        if (on.size > 0) {
          on.clear();
          commit();
        }
        return;
      }
      if (move === "jump") {
        instantly(() => draw(next.box));
        mark.style.opacity = "1";
        light(current.link);
      } else {
        // Where the indicator is now (mid-slide when the visitor clicks fast): the inline style is live, so the
        // transition continues from there; the colour timing starts from the same span.
        const was = last ?? next;
        const cap = firstPx(end.style.width, 0);
        const startStyle = getComputedStyle(start);
        const from: Span = spanFromCaps(
          firstPx(startStyle.translate, was.box.x),
          firstPx(getComputedStyle(end).translate, was.box.x + was.box.w - cap),
          cap,
        );
        const duration = firstTimeMs(startStyle.transitionDuration);
        const easing = firstBezier(startStyle.transitionTimingFunction);
        draw(next.box);
        if (pill) {
          if (duration < 1) {
            light(current.link);
          } else {
            const to: Span = { start: next.box.x, width: next.box.w };
            // The colour flip is centred on the moment: it starts half a colour transition earlier.
            const lead = firstTimeMs(getComputedStyle(current.link).transitionDuration) / 2;
            const at = (ms: number, run: () => void) => timers.push(window.setTimeout(run, Math.max(0, ms - lead)));
            for (const link of nav.querySelectorAll<HTMLElement>("a.tabs-link")) {
              const href = hrefOf(link);
              if (link === current.link || !on.has(href)) continue;
              const box = measure(link);
              const { leaveAt } = colourSwitch(from, to, { start: box.x, width: box.w }, duration, easing);
              at(leaveAt, () => {
                on.delete(href);
                commit();
              });
            }
            const href = hrefOf(current.link);
            if (!on.has(href)) {
              at(colourSwitch(from, to, null, duration, easing).arriveAt, () => {
                on.add(href);
                commit();
              });
            }
          }
        }
      }
      last = next;
    };

    const sizes = new ResizeObserver(() => place(false));
    const observeSizes = () => {
      sizes.disconnect();
      sizes.observe(nav);
      for (const el of nav.querySelectorAll<HTMLElement>("a.tabs-link")) sizes.observe(el);
    };
    // A link's `aria-current` changes on a navigation; the list is replaced when a <Suspense> around it resolves.
    const changes = new MutationObserver(() => {
      const now = here();
      const navigated = now !== url;
      url = now;
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
      cancel();
      setPlaced(false);
      setCovered([]);
    };
  }, [pill]);

  return (
    <nav
      ref={navRef}
      aria-label={label}
      data-tabs={id}
      data-indicator={placed ? "" : undefined}
      className={cn("tabs relative", pill ? "tabs-pill" : "tabs-underline", className)}
    >
      {pill && covered.length > 0 ? (
        // The links the pill covers get white text (the doubled class beats the hover colour). Nothing is rendered on the
        // server or before the pill is placed, so hydration sees the same markup.
        <style>{`.tabs-pill[data-indicator][data-tabs=${cssString(id)}] a.tabs-link.tabs-link:is(${covered.map((href) => `[href=${cssString(href)}]`).join(",")}){color:var(--color-on-inverse);background-color:transparent;--tabs-count-bg:var(--color-inverse-raised);--tabs-count-ink:var(--color-on-inverse)}`}</style>
      ) : null}
      {/* First in the nav: the links (positioned) paint above it. */}
      <span ref={markRef} aria-hidden="true" className="tabs-indicator">
        <span ref={startRef} className="tabs-cap-start" />
        <span ref={middleRef} className="tabs-middle" />
        <span ref={endRef} className="tabs-cap-end" />
      </span>
      {children}
    </nav>
  );
}
