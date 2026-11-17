import { describe, expect, it } from "vitest";
import { boxWithin, nextMove, sameBox, translateOf, type Box } from "./sliding-indicator";

const box = (x: number, y: number, w = 48, h = 48): Box => ({ x, y, w, h });

describe("boxWithin: the selected element's box in the nav's padding box", () => {
  it("is the difference of the two rectangles, moved in by the nav's border", () => {
    const link = { left: 116, top: 260, width: 48, height: 48 };
    const nav = { left: 100, top: 200, width: 80, height: 600 };
    expect(boxWithin(link, nav)).toEqual({ x: 16, y: 60, w: 48, h: 48 });
    expect(boxWithin(link, nav, { left: 1, top: 2 })).toEqual({ x: 15, y: 58, w: 48, h: 48 });
  });

  it("gives the same numbers wherever the nav sits on the page (physical px)", () => {
    // A nav far from the left edge of a wide window: its link is still 16px in from the nav's own left side.
    const nav = { left: 1824, top: 16, width: 80, height: 900 };
    const link = { left: 1840, top: 120, width: 48, height: 48 };
    expect(boxWithin(link, nav)).toEqual({ x: 16, y: 104, w: 48, h: 48 });
  });
});

describe("sameBox", () => {
  it("ignores sub-pixel noise and sees a real move or resize", () => {
    expect(sameBox(box(16, 60), box(16.3, 59.8))).toBe(true);
    expect(sameBox(box(16, 60), box(16, 112))).toBe(false);
    expect(sameBox(box(16, 60, 48, 48), box(16, 60, 44, 44))).toBe(false);
  });
});

describe("nextMove: slide only after a navigation, jump everywhere else", () => {
  const a = { el: "orders", box: box(16, 60) };
  const b = { el: "wallet", box: box(16, 116) };

  it("the first placement jumps, with or without a navigation", () => {
    expect(nextMove(null, a, false)).toBe("jump");
    expect(nextMove(null, a, true)).toBe("jump");
  });

  it("a new current link after a navigation slides", () => {
    expect(nextMove(a, b, true)).toBe("slide");
  });

  it("a new current link without a navigation (a list resolved or swapped after hydration) jumps", () => {
    expect(nextMove(a, b, false)).toBe("jump");
  });

  it("the same link at the same place stays; moved or resized (a resize, the wallet slot dropped) it jumps", () => {
    expect(nextMove(a, { el: "orders", box: box(16, 60.2) }, true)).toBe("stay");
    expect(nextMove(a, { el: "orders", box: box(16, 4) }, false)).toBe("jump");
    expect(nextMove(a, { el: "orders", box: box(18, 62, 44, 44) }, true)).toBe("jump");
  });

  it("no current link hides a shown indicator, and keeps a hidden one hidden", () => {
    expect(nextMove(a, null, true)).toBe("hide");
    expect(nextMove(null, null, true)).toBe("stay");
  });
});

describe("translateOf", () => {
  it("writes a physical translate in px, rounded to hundredths", () => {
    expect(translateOf(box(16, 60))).toBe("16px 60px");
    expect(translateOf(box(4.123456, 0.5))).toBe("4.12px 0.5px");
  });
});
