import { describe, expect, it } from "vitest";
import { ACCOUNT_FAMILIES, familyOf, rankKindOf } from "./family";

describe("familyOf", () => {
  it("gives the portal family to a merchant rank", () => {
    expect(familyOf({ rank: { kind: "merchant" } })).toBe("client");
  });

  it("gives the shop family to a retail rank", () => {
    expect(familyOf({ rank: { kind: "retail" } })).toBe("store");
  });

  it("fails closed: anything that is not exactly the word merchant is the shop family", () => {
    const notMerchant: unknown[] = [
      "wholesale",
      "b2b",
      "Merchant",
      "MERCHANT",
      " merchant",
      "merchant ",
      "merchants",
      "",
      null,
      undefined,
      0,
      true,
      ["merchant"],
    ];
    for (const kind of notMerchant) {
      expect(familyOf({ rank: { kind } } as never), String(kind)).toBe("store");
    }
  });

  it("fails closed when the answer has no usable rank", () => {
    expect(familyOf({})).toBe("store");
    expect(familyOf({ rank: null })).toBe("store");
    expect(familyOf({ rank: {} })).toBe("store");
    expect(familyOf(null)).toBe("store");
    expect(familyOf(undefined)).toBe("store");
  });

  it("reads the rank kind and nothing else", () => {
    const retailNamedMerchant = { rank: { kind: "retail", name: "merchant" }, name: "merchant", company: "merchant" };
    expect(familyOf(retailNamedMerchant)).toBe("store");
    const merchantWithoutNames = { rank: { kind: "merchant" } };
    expect(familyOf(merchantWithoutNames)).toBe("client");
  });
});

describe("rankKindOf", () => {
  it("is merchant only for the word merchant, and retail otherwise", () => {
    expect(rankKindOf({ rank: { kind: "merchant" } })).toBe("merchant");
    expect(rankKindOf({ rank: { kind: "retail" } })).toBe("retail");
    expect(rankKindOf({ rank: { kind: "something-new" } })).toBe("retail");
    expect(rankKindOf(null)).toBe("retail");
    expect(rankKindOf(undefined)).toBe("retail");
  });
});

describe("ACCOUNT_FAMILIES", () => {
  it("lists the two families", () => {
    expect([...ACCOUNT_FAMILIES].sort()).toEqual(["client", "store"]);
  });
});
