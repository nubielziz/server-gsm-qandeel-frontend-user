// Who may open a shop checkout, and the addresses it builds. A merchant rank orders from its own price list: the retail form
// is never mounted for it, so no checkout session is created.
import { describe, expect, it } from "vitest";
import { checkoutAccess, checkoutBuyerOf, checkoutSignInHref, priceListHref, sessionPriceList } from "./access";

const retail = { email: "buyer@example.com", country: "DE", rank: { kind: "retail" } };
const merchant = { email: "ops@example.com", country: "JO", rank: { kind: "merchant" } };

describe("checkoutAccess", () => {
  it("gives a merchant rank the price list, never the form, whether or not guests may buy", () => {
    expect(checkoutAccess(merchant, true)).toBe("price-list");
    expect(checkoutAccess(merchant, false)).toBe("price-list");
  });

  it("gives a retail rank the form with its own account", () => {
    expect(checkoutAccess(retail, true)).toBe("account-form");
    expect(checkoutAccess(retail, false)).toBe("account-form");
  });

  it("gives a visitor who is signed out the guest form, or the way to sign in when guest checkout is off", () => {
    expect(checkoutAccess(null, true)).toBe("guest-form");
    expect(checkoutAccess(undefined, true)).toBe("guest-form");
    expect(checkoutAccess(null, false)).toBe("sign-in");
  });

  it("fails closed to the retail rights: only the exact word merchant leaves the retail form", () => {
    for (const kind of ["partner", "", "Merchant", "b2b", undefined, null]) {
      expect(checkoutAccess({ rank: { kind } }, false), String(kind)).toBe("account-form");
    }
    expect(checkoutAccess({}, true)).toBe("account-form");
    expect(checkoutAccess({ rank: null }, true)).toBe("account-form");
  });
});

describe("checkoutBuyerOf", () => {
  it("locks a retail account's email and fills in its country", () => {
    expect(checkoutBuyerOf(retail)).toEqual({ email: "buyer@example.com", country: "DE" });
  });

  it("opens no form for a merchant rank, and none for a visitor who is signed out", () => {
    expect(checkoutBuyerOf(merchant)).toBeNull();
    expect(checkoutBuyerOf(null)).toBeNull();
    expect(checkoutBuyerOf(undefined)).toBeNull();
  });

  it("gives only the two facts the form needs", () => {
    expect(Object.keys(checkoutBuyerOf(retail) ?? {}).sort()).toEqual(["country", "email"]);
  });
});

describe("sessionPriceList", () => {
  it("gives a merchant rank the way to its own price and the way back to the service", () => {
    expect(sessionPriceList(merchant, 42, "icloud-clean")).toEqual({
      priceListHref: "/en/account/services/42",
      serviceHref: "/en/services/icloud-clean",
    });
  });

  it("sends a merchant rank back to the service list when the service is no longer listed", () => {
    expect(sessionPriceList(merchant, 42, null)).toEqual({ priceListHref: "/en/account/services/42", serviceHref: "/en/services" });
  });

  it("gives a retail rank, a visitor who is signed out and an account that was not read no notice", () => {
    expect(sessionPriceList(retail, 42, "icloud-clean")).toBeNull();
    expect(sessionPriceList(null, 42, "icloud-clean")).toBeNull();
    expect(sessionPriceList(undefined, 42, "icloud-clean")).toBeNull();
  });

  it("fails closed: only the exact word merchant gets the notice", () => {
    for (const kind of ["partner", "", "Merchant", undefined, null]) {
      expect(sessionPriceList({ rank: { kind } }, 42, "x"), String(kind)).toBeNull();
    }
    expect(sessionPriceList({}, 42, "x")).toBeNull();
  });
});

describe("addresses", () => {
  it("leads a merchant rank to the page of the service in its price list", () => {
    expect(priceListHref(42)).toBe("/en/account/services/42");
  });

  it("comes back to the page after sign-in with no account type, whoever signs in", () => {
    const href = checkoutSignInHref("/en/checkout?service=icloud-clean&quantity=3");
    expect(href).toBe("/en/sign-in?next=%2Fen%2Fcheckout%3Fservice%3Dicloud-clean%26quantity%3D3");
    expect(href).not.toContain("as=");
    expect(new URL(href, "http://x").searchParams.get("next")).toBe("/en/checkout?service=icloud-clean&quantity=3");
  });
});
