import { describe, expect, it } from "vitest";
import { PREFETCH_CARDS, cardPrefetch } from "./service-card";

describe("cardPrefetch: which card title links prefetch the service page's content (plan P3.2)", () => {
  it("is true for the first PREFETCH_CARDS cards of a list", () => {
    expect(PREFETCH_CARDS).toBe(4);
    expect([0, 1, 2, 3].map(cardPrefetch)).toEqual([true, true, true, true]);
  });

  it("keeps Next's default for the later cards and for cards outside a list", () => {
    expect(cardPrefetch(4)).toBe("auto");
    expect(cardPrefetch(23)).toBe("auto");
    expect(cardPrefetch(undefined)).toBe("auto");
  });
});
