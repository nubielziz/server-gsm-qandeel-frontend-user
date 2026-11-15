import { describe, expect, it } from "vitest";
import { GLIDE, colourSwitch, coverage, firstBezier, firstTimeMs, pillAt, timeForProgress, type Span } from "./nav-pill-timing";

const LINEAR: [number, number, number, number] = [0, 0, 1, 1];

describe("coverage: how much of a link the pill covers", () => {
  it("is 1 on the link, 0 beside it and the overlap's share in between", () => {
    const link: Span = { start: 100, width: 80 };
    expect(coverage({ start: 100, width: 80 }, link)).toBe(1);
    expect(coverage({ start: 0, width: 90 }, link)).toBe(0);
    expect(coverage({ start: 140, width: 80 }, link)).toBe(0.5);
    expect(coverage({ start: 60, width: 60 }, link)).toBe(0.25);
  });

  it("is 0 for a link without width (hidden)", () => {
    expect(coverage({ start: 0, width: 100 }, { start: 0, width: 0 })).toBe(0);
  });
});

describe("pillAt: both edges of the pill move linearly with the progress", () => {
  it("starts on the old link, ends on the new one and resizes on the way", () => {
    const from: Span = { start: 0, width: 100 };
    const to: Span = { start: 200, width: 60 };
    expect(pillAt(from, to, 0)).toEqual(from);
    expect(pillAt(from, to, 1)).toEqual(to);
    expect(pillAt(from, to, 0.5)).toEqual({ start: 100, width: 80 });
  });
});

describe("timeForProgress: when a CSS cubic-bezier reaches a progress", () => {
  it("is the progress itself for a linear curve", () => {
    for (const p of [0, 0.1, 0.5, 0.9, 1]) expect(timeForProgress(p, LINEAR)).toBeCloseTo(p, 3);
  });

  it("is early for the --ease-glide ease-out and grows with the progress", () => {
    const half = timeForProgress(0.5, GLIDE);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(0.25);
    expect(timeForProgress(0.9, GLIDE)).toBeGreaterThan(half);
    expect(timeForProgress(0.9, GLIDE)).toBeLessThan(1);
  });
});

describe("colourSwitch: the text colour follows the slide", () => {
  const A: Span = { start: 0, width: 120 };
  const B: Span = { start: 124, width: 100 };
  const far: Span = { start: 760, width: 140 };

  it("greys the left link when it is less than half covered and whitens the new one when it is half covered", () => {
    const { leaveAt, arriveAt } = colourSwitch(A, B, A, 300, LINEAR);
    // Linear: the pill's start passes 60 (A half uncovered) at p ≈ 0.48 and its end passes 174 (B half covered) at p ≈ 0.52.
    expect(leaveAt).toBeGreaterThan(130);
    expect(leaveAt).toBeLessThan(170);
    expect(arriveAt).toBeGreaterThan(leaveAt);
    expect(arriveAt).toBeLessThan(200);
  });

  it("switches within the slide and earlier than linear on the ease-out", () => {
    const glide = colourSwitch(A, B, A, 300);
    const linear = colourSwitch(A, B, A, 300, LINEAR);
    expect(glide.arriveAt).toBeLessThan(linear.arriveAt);
    expect(glide.leaveAt).toBeLessThan(linear.leaveAt);
    expect(glide.arriveAt).toBeLessThanOrEqual(300);
  });

  it("whitens a far link later in the slide than a near one", () => {
    expect(colourSwitch(A, far, A, 300).arriveAt).toBeGreaterThan(colourSwitch(A, B, A, 300).arriveAt);
  });

  it("works the same towards the start (right to left in Arabic: offsets are physical)", () => {
    const right = colourSwitch(A, B, A, 300);
    const left = colourSwitch(B, A, B, 300);
    expect(Math.abs(left.arriveAt - right.arriveAt)).toBeLessThanOrEqual(15);
  });

  it("starts from where the pill is now, mid-slide", () => {
    const mid = pillAt(A, far, 0.7);
    const { arriveAt } = colourSwitch(mid, B, null, 300);
    expect(arriveAt).toBeGreaterThan(0);
    expect(arriveAt).toBeLessThanOrEqual(300);
  });

  it("has nothing to grey when no link is white", () => {
    expect(colourSwitch(A, B, null, 300).leaveAt).toBe(0);
  });
});

describe("firstTimeMs and firstBezier: reading the pill's computed transition", () => {
  it("reads the first duration in ms (seconds, ms, the reduced-motion 0.01 ms) and 0 for nothing", () => {
    expect(firstTimeMs("0.3s, 0.3s, 0.3s")).toBe(300);
    expect(firstTimeMs("120ms, 120ms")).toBe(120);
    expect(firstTimeMs("1e-05s")).toBeCloseTo(0.01, 5);
    expect(firstTimeMs("0s")).toBe(0);
    expect(firstTimeMs("")).toBe(0);
  });

  it("reads the first cubic-bezier, else falls back to --ease-glide", () => {
    expect(firstBezier("cubic-bezier(0.2, 0, 0, 1), ease")).toEqual([0.2, 0, 0, 1]);
    expect(firstBezier("ease")).toEqual(GLIDE);
    expect(firstBezier("")).toEqual(GLIDE);
  });
});
