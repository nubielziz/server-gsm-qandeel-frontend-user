// The geometry of the workspace's sliding selection (components/layout/sliding-nav.tsx): where the indicator goes and
// whether it slides or jumps there. Plain module (no DOM): unit-tested.
// - Boxes are physical px relative to the nav's padding box (`getBoundingClientRect` differences), so the indicator
//   is placed with a physical `translate`.
// - Only a change of the selected element after a navigation (a new pathname) slides. The first placement, a resize, a
//   list that resolves its active link after hydration (the nav's <Suspense>) or a swapped list (the session's own nav)
//   jumps, and the same element at the same box does nothing.

/** A box in px relative to the container: `x`/`y` are the physical left/top offsets. */
export type Box = { x: number; y: number; w: number; h: number };

/** The physical rectangle of an element as `getBoundingClientRect` gives it. */
export type RectLike = { left: number; top: number; width: number; height: number };

/**
 * The box of `el` inside `container`: the offset from the container's padding box (its border rectangle moved in by its
 * border widths, `clientLeft`/`clientTop`), where an absolutely positioned child at `top: 0; left: 0` starts.
 */
export function boxWithin(el: RectLike, container: RectLike, border: { left: number; top: number } = { left: 0, top: 0 }): Box {
  return {
    x: el.left - container.left - border.left,
    y: el.top - container.top - border.top,
    w: el.width,
    h: el.height,
  };
}

/** True when two boxes differ by less than half a pixel on every side (sub-pixel layout noise is no move). */
export function sameBox(a: Box, b: Box): boolean {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;
}

/** What the indicator does next. */
export type Move = "stay" | "jump" | "slide" | "hide";

/**
 * The next move for a selected element `next` (null: nothing is selected) at `box`, after `last` (where the indicator
 * is now, null when it is not shown). `navigated` is true when the pathname changed since the last placement.
 */
export function nextMove<T>(
  last: { el: T; box: Box } | null,
  next: { el: T; box: Box } | null,
  navigated: boolean,
): Move {
  if (!next) return last ? "hide" : "stay";
  if (last && last.el === next.el && sameBox(last.box, next.box)) return "stay";
  // No slide on the first placement, nor when the same element only moved or resized (a resize, a swapped list).
  if (!last || !navigated || last.el === next.el) return "jump";
  return "slide";
}

/** The CSS `translate` value for a box (physical px). */
export function translateOf(box: Box): string {
  return `${round(box.x)}px ${round(box.y)}px`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
