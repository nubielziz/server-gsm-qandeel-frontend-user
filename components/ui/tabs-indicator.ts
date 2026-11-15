// The motion of link tabs (components/ui/tabs.tsx, tabs-nav.tsx; owner, 2026-11-15) as plain functions: unit-tested.
// - The indicator (the underline, or the black pill of `variant="pill"`) slides AND resizes to the new tab with transforms
//   only: three pieces, a start cap, a middle and an end cap, each moved with `translate` and the middle stretched with
//   `scale` (a round cap never stretches, so the pill keeps its round ends while it changes width). All three run on the
//   same transition, so they stay joined at every frame; the middle reaches `SEAM` px under each cap so no hairline shows.
// - Boxes are physical px relative to the nav's padding box at scroll origin (the same numbers in both writing
//   directions), so the indicator works in Arabic as is.
// - The list under the tabs slides a few px and fades toward the side of the tab that was picked: the tab links carry a
//   transition type (`TAB_TO_END` / `TAB_TO_START`, by their place against the current tab) and `<TabPanel>`'s
//   <ViewTransition> maps it to its enter/exit classes (globals.css "Link tabs"). Other navigations carry no type and the
//   list swaps at once.
import type { ViewTransitionClassPerType } from "react";
import type { Box, RectLike } from "@/components/layout/sliding-indicator";

/** The transition type of a tab link after the current one (towards the end side: left in Arabic). */
export const TAB_TO_END = "tab-to-end";
/** The transition type of a tab link before the current one (towards the start side). */
export const TAB_TO_START = "tab-to-start";

/** The transition types of the tab at `index` while the tab at `activeIndex` is current; none for the current tab itself. */
export function tabTransitionTypes(index: number, activeIndex: number): string[] | undefined {
  if (activeIndex < 0 || index === activeIndex) return undefined;
  return [index > activeIndex ? TAB_TO_END : TAB_TO_START];
}

/** The new list comes in from the side of the tab that was picked (globals.css `tab-in-from-end` / `tab-in-from-start`). */
export const TAB_PANEL_ENTER: ViewTransitionClassPerType = {
  [TAB_TO_END]: "tab-in-from-end",
  [TAB_TO_START]: "tab-in-from-start",
  default: "none",
};
/** The old list leaves toward the other side (globals.css `tab-out-to-start` / `tab-out-to-end`). */
export const TAB_PANEL_EXIT: ViewTransitionClassPerType = {
  [TAB_TO_END]: "tab-out-to-start",
  [TAB_TO_START]: "tab-out-to-end",
  default: "none",
};

/** The middle piece's own width in px (CSS `.tabs-middle`), before `scale` stretches it to the tab. */
export const MIDDLE_BASE = 100;
/** How far the middle reaches under each cap. */
export const SEAM = 1;

/** Where the three pieces go for one box: `translate` values in px and the middle's horizontal `scale`. */
export type Pieces = {
  /** The width of each cap (half the height: a round end), never more than half the box. */
  cap: number;
  height: number;
  start: { x: number; y: number };
  middle: { x: number; y: number; scale: number };
  end: { x: number; y: number };
};

/** The pieces that draw `box`. */
export function piecesOf(box: Box): Pieces {
  const cap = Math.max(0, Math.min(box.h / 2, box.w / 2));
  const middleStart = Math.max(box.x, box.x + cap - SEAM);
  const middleEnd = Math.min(box.x + box.w, box.x + box.w - cap + SEAM);
  return {
    cap: round(cap),
    height: round(box.h),
    start: { x: round(box.x), y: round(box.y) },
    middle: { x: round(middleStart), y: round(box.y), scale: Math.max(0, middleEnd - middleStart) / MIDDLE_BASE },
    end: { x: round(box.x + box.w - cap), y: round(box.y) },
  };
}

/**
 * The box of `el` inside the scrolling nav `container`, in the nav's content coordinates: the offset from its padding box
 * (`clientLeft`/`clientTop`) plus how far it is scrolled (`scrollLeft` is negative in a right-to-left list scrolled to the
 * left, which gives the same content position), where an absolute child at `top: 0; left: 0` starts.
 */
export function boxInScroller(
  el: RectLike,
  container: RectLike,
  frame: { clientLeft: number; clientTop: number; scrollLeft: number; scrollTop: number },
): Box {
  return {
    x: el.left - container.left - frame.clientLeft + frame.scrollLeft,
    y: el.top - container.top - frame.clientTop + frame.scrollTop,
    w: el.width,
    h: el.height,
  };
}

/** The span the indicator covers now, read from its caps' `translate` (mid-slide on a fast second click). */
export function spanFromCaps(startX: number, endX: number, cap: number): { start: number; width: number } {
  return { start: startX, width: Math.max(0, endX + cap - startX) };
}

/** The first length of a computed `translate` (`"12.5px 4px"`), else `fallback`. */
export function firstPx(value: string, fallback: number): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
