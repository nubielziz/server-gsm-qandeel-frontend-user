import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  boxInScroller,
  firstPx,
  MIDDLE_BASE,
  piecesOf,
  SEAM,
  spanFromCaps,
  TAB_PANEL_ENTER,
  TAB_PANEL_EXIT,
  TAB_TO_END,
  TAB_TO_START,
  tabTransitionTypes,
} from "./tabs-indicator";

describe("tabTransitionTypes: each tab link names the side it lies on, from the current tab", () => {
  it("tags the tabs after the current one `tab-to-end` and those before `tab-to-start`", () => {
    expect(tabTransitionTypes(3, 1)).toEqual([TAB_TO_END]);
    expect(tabTransitionTypes(0, 1)).toEqual([TAB_TO_START]);
  });

  it("tags nothing on the current tab, nor when no tab is current", () => {
    expect(tabTransitionTypes(1, 1)).toBeUndefined();
    expect(tabTransitionTypes(2, -1)).toBeUndefined();
  });
});

describe("TabPanel's classes: the new list comes from the side of the picked tab, the old one leaves the other way", () => {
  it("maps each direction to one enter and one exit class, and nothing else animates", () => {
    expect(TAB_PANEL_ENTER).toEqual({ [TAB_TO_END]: "tab-in-from-end", [TAB_TO_START]: "tab-in-from-start", default: "none" });
    expect(TAB_PANEL_EXIT).toEqual({ [TAB_TO_END]: "tab-out-to-start", [TAB_TO_START]: "tab-out-to-end", default: "none" });
  });

  it("every class has its rule in globals.css, and reduced motion stops the view transition pseudo-elements", () => {
    const css = readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");
    for (const name of [TAB_PANEL_ENTER[TAB_TO_END], TAB_PANEL_ENTER[TAB_TO_START]]) expect(css).toContain(`::view-transition-new(.${name})`);
    for (const name of [TAB_PANEL_EXIT[TAB_TO_END], TAB_PANEL_EXIT[TAB_TO_START]]) expect(css).toContain(`::view-transition-old(.${name})`);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*::view-transition-new\(\*\)[\s\S]*animation-duration: 0s !important/);
  });
});

describe("piecesOf: two round caps and a stretched middle draw the box", () => {
  it("a pill: caps of half the height at both ends, the middle between them reaching SEAM px under each cap", () => {
    const p = piecesOf({ x: 10, y: 0, w: 120, h: 44 });
    expect(p.cap).toBe(22);
    expect(p.height).toBe(44);
    expect(p.start).toEqual({ x: 10, y: 0 });
    expect(p.end).toEqual({ x: 108, y: 0 });
    expect(p.middle.x).toBe(10 + 22 - SEAM);
    expect(p.middle.scale * MIDDLE_BASE).toBeCloseTo(120 - 44 + 2 * SEAM);
    // Joined: the middle starts before the start cap ends and ends after the end cap starts.
    expect(p.middle.x).toBeLessThan(p.start.x + p.cap);
    expect(p.middle.x + p.middle.scale * MIDDLE_BASE).toBeGreaterThan(p.end.x);
  });

  it("an underline (2px high): 1px caps, the middle covers the whole width", () => {
    const p = piecesOf({ x: 0, y: 41, w: 60, h: 2 });
    expect(p.cap).toBe(1);
    expect(p.middle.x).toBe(0);
    expect(p.middle.scale * MIDDLE_BASE).toBeCloseTo(60);
    expect(p.end).toEqual({ x: 59, y: 41 });
  });

  it("a box narrower than it is high never gets caps wider than half of it, nor a negative middle", () => {
    const p = piecesOf({ x: 5, y: 0, w: 30, h: 44 });
    expect(p.cap).toBe(15);
    expect(p.end.x).toBe(20);
    expect(p.middle.scale).toBeGreaterThanOrEqual(0);
    expect(p.middle.x + p.middle.scale * MIDDLE_BASE).toBeLessThanOrEqual(35);
  });

  it("the CSS width of the middle is MIDDLE_BASE", () => {
    const css = readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");
    expect(css).toMatch(new RegExp(`\\.tabs-middle \\{\\s*width: ${MIDDLE_BASE}px;`));
  });
});

describe("boxInScroller: the tab's box in the nav's content (the nav scrolls sideways on phones)", () => {
  const nav = { left: 100, top: 200, width: 320, height: 46 };

  it("adds how far the nav is scrolled, so the indicator scrolls with the links", () => {
    const link = { left: 60, top: 201, width: 90, height: 44 };
    expect(boxInScroller(link, nav, { clientLeft: 0, clientTop: 0, scrollLeft: 80, scrollTop: 0 })).toEqual({ x: 40, y: 1, w: 90, h: 44 });
  });

  it("in Arabic a list scrolled to the left has a negative scrollLeft: the same content position", () => {
    // Unscrolled, the link sits at x = 200 in the nav. Scrolled 50px to the left, it shows 50px further right.
    const scrolled = { left: 100 + 200 + 50, top: 200, width: 90, height: 44 };
    expect(boxInScroller(scrolled, nav, { clientLeft: 0, clientTop: 0, scrollLeft: -50, scrollTop: 0 }).x).toBe(200);
  });

  it("starts at the padding box (inside the nav's border)", () => {
    const link = { left: 101, top: 201, width: 90, height: 44 };
    expect(boxInScroller(link, nav, { clientLeft: 1, clientTop: 1, scrollLeft: 0, scrollTop: 0 })).toEqual({ x: 0, y: 0, w: 90, h: 44 });
  });
});

describe("spanFromCaps and firstPx: where the pill is mid-slide", () => {
  it("reads the span from the two caps' translate", () => {
    expect(spanFromCaps(10, 108, 22)).toEqual({ start: 10, width: 120 });
    expect(spanFromCaps(50, 40, 0)).toEqual({ start: 50, width: 0 });
  });

  it("takes the first length of a computed translate, else the fallback", () => {
    expect(firstPx("12.5px 4px", 0)).toBe(12.5);
    expect(firstPx("none", 7)).toBe(7);
    expect(firstPx("", 3)).toBe(3);
  });
});
