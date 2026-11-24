// The address a row of an orders list opens (lib/account/order-href.ts): the tracking page for a retail row, the order's own
// page for a merchant row, and no merchant address ever for a retail account.
import { describe, expect, it } from "vitest";
import { familyOf } from "./family";
import { orderHref } from "./order-href";

describe("orderHref, retail rows", () => {
  it("opens the tracking page of the row's token", () => {
    expect(orderHref("store", { id: 12, trackingToken: "t_abc123" })).toBe("/en/track/t_abc123");
  });

  it("encodes a token, so it can never leave the tracking path", () => {
    expect(orderHref("store", { id: 12, trackingToken: "a/b?c#d" })).toBe("/en/track/a%2Fb%3Fc%23d");
    expect(orderHref("store", { id: 12, trackingToken: "../account" })).toBe("/en/track/..%2Faccount");
  });

  it("has no address for a row without a token, and never falls back to the order's id", () => {
    expect(orderHref("store", { id: 12, trackingToken: null })).toBeNull();
    expect(orderHref("store", { id: 12, trackingToken: "" })).toBeNull();
    expect(orderHref("store", { id: 12 })).toBeNull();
  });
});

describe("orderHref, merchant rows", () => {
  it("opens the order's own page in the account area", () => {
    expect(orderHref("client", { id: 42 })).toBe("/en/account/orders/42");
  });

  it("ignores a token, which a merchant row does not have", () => {
    expect(orderHref("client", { id: 42, trackingToken: "t_abc123" })).toBe("/en/account/orders/42");
  });
});

describe("orderHref, by the account's rank", () => {
  const row = { id: 7, trackingToken: "t_seven" };

  it("sends a merchant rank to the order page and a retail rank to the tracking page", () => {
    expect(orderHref(familyOf({ rank: { kind: "merchant" } }), row)).toBe("/en/account/orders/7");
    expect(orderHref(familyOf({ rank: { kind: "retail" } }), row)).toBe("/en/track/t_seven");
  });

  it("gives a rank kind it does not know the retail address (fails closed)", () => {
    expect(orderHref(familyOf({ rank: { kind: "partner" } }), row)).toBe("/en/track/t_seven");
    expect(orderHref(familyOf({ rank: null }), row)).toBe("/en/track/t_seven");
    expect(orderHref(familyOf(null), row)).toBe("/en/track/t_seven");
  });

  it("never names the old portal folder", () => {
    for (const family of ["store", "client"] as const) {
      expect(orderHref(family, row) ?? "").not.toContain("/merchant");
    }
  });
});
