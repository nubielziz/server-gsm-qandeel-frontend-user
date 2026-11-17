// When the text of the nav row's links changes colour while the black pill slides (components/layout/nav-row.tsx).
// The pill moves on a CSS transition (`translate` and `width`, --duration-slow, --ease-glide). A link's text turns
// white when the moving pill covers half of the link and back to grey when it covers less than half, so the text is
// never white on the light row, nor dark on the pill, for more than a frame or two. Plain module (no DOM): unit-tested.

/** A horizontal span of the row in px: a link's box or the pill's (`start` = offsetLeft, physical). */
export type Span = { start: number; width: number };

/** A CSS cubic-bezier as its four control values `[x1, y1, x2, y2]`. */
export type Bezier = [number, number, number, number];

/** `--ease-glide` (globals.css): the fallback when the computed timing function cannot be read. */
export const GLIDE: Bezier = [0.22, 1, 0.36, 1];

/** How much of `box` (0 to 1) the span `pill` covers. */
export function coverage(pill: Span, box: Span): number {
  if (box.width <= 0) return 0;
  const overlap = Math.min(pill.start + pill.width, box.start + box.width) - Math.max(pill.start, box.start);
  return Math.max(0, Math.min(1, overlap / box.width));
}

/** The pill at `progress` (0 to 1) of its slide from `from` to `to`: both edges move linearly with the progress. */
export function pillAt(from: Span, to: Span, progress: number): Span {
  return {
    start: from.start + (to.start - from.start) * progress,
    width: from.width + (to.width - from.width) * progress,
  };
}

function bezierAxis(s: number, a: number, b: number): number {
  const r = 1 - s;
  return 3 * r * r * s * a + 3 * r * s * s * b + s * s * s;
}

/**
 * The fraction of the duration (0 to 1) at which a CSS `cubic-bezier` reaches `progress`. Needs a progress curve that
 * never goes back (y1 and y2 in 0..1, as every ease-out in globals.css); found by bisection on the curve's parameter.
 */
export function timeForProgress(progress: number, [x1, y1, x2, y2]: Bezier): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    if (bezierAxis(mid, y1, y2) < progress) low = mid;
    else high = mid;
  }
  return bezierAxis((low + high) / 2, x1, x2);
}

/** The first progress (in 1/200 steps) at which `test` holds, or 1 when it holds only at the end. */
function firstProgress(test: (progress: number) => boolean): number {
  for (let step = 0; step <= 200; step++) {
    const progress = step / 200;
    if (test(progress)) return progress;
  }
  return 1;
}

export type ColourSwitch = {
  /** Ms after the slide starts at which the link the pill leaves covers less than half: its text turns grey. */
  leaveAt: number;
  /** Ms after the slide starts at which the new link is half covered: its text turns white. */
  arriveAt: number;
};

/**
 * When the two links' text colours should flip during a slide of `durationMs` from `from` (where the pill is now) to
 * `to` (the new link's box). `left` is the box of the link the pill leaves (null when no link is white).
 */
export function colourSwitch(from: Span, to: Span, left: Span | null, durationMs: number, easing: Bezier = GLIDE): ColourSwitch {
  const at = (test: (progress: number) => boolean) => Math.round(timeForProgress(firstProgress(test), easing) * durationMs);
  return {
    leaveAt: left ? at((p) => coverage(pillAt(from, to, p), left) < 0.5) : 0,
    arriveAt: at((p) => coverage(pillAt(from, to, p), to) >= 0.5),
  };
}

/** The first time of a computed `transition-duration` ("0.3s, 0.3s" or "300ms") in ms; 0 when it cannot be read. */
export function firstTimeMs(value: string): number {
  const match = /^\s*(-?[\d.]+(?:e-?\d+)?)(ms|s)\b/i.exec(value);
  if (!match) return 0;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return match[2].toLowerCase() === "s" ? n * 1000 : n;
}

/** The first `cubic-bezier(…)` of a computed `transition-timing-function`, else `fallback`. */
export function firstBezier(value: string, fallback: Bezier = GLIDE): Bezier {
  const match = /cubic-bezier\(\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*\)/i.exec(value);
  if (!match) return fallback;
  const values = match.slice(1, 5).map(Number);
  return values.every(Number.isFinite) ? (values as Bezier) : fallback;
}
