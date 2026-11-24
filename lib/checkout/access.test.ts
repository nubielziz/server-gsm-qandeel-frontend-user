// Who may open a shop checkout, and the addresses it builds. A merchant rank gets its own order form at the same checkout address
// (decision 003): the retail form is never mounted for it, so no checkout session is created.
import { describe, expect, it } from "vitest";
import { checkoutAccess, checkoutBuyerOf, checkoutHref, checkoutSignInHref, sessionPriceList } from "./access";

const retail = { email: "buyer@example.com", country: "DE", rank: { kind: "retail" } };
const merchant = { email: "ops@example.com", country: "JO", rank: { kind: "merchant" } };

describe("checkoutAccess", () => {
  it("gives a merchant rank its own order form, never the retail form, whether or not guests may buy", () => {
    expect(checkoutAccess(merchant, true)).toBe("order-form");
    expect(checkoutAccess(merchant, false)).toBe("order-form");
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

  it("opens no retail form for a merchant rank, and none for a visitor who is signed out", () => {
    expect(checkoutBuyerOf(merchant)).toBeNull();
    expect(checkoutBuyerOf(null)).toBeNull();
    expect(checkoutBuyerOf(undefined)).toBeNull();
  });

  it("gives only the two facts the form needs", () => {
    expect(Object.keys(checkoutBuyerOf(retail) ?? {}).sort()).toEqual(["country", "email"]);
  });
});

describe("sessionPriceList", () => {
  it("gives a merchant rank the way to its own order form at the service's checkout address and the way back", () => {
    expect(sessionPriceList(merchant, "icloud-clean")).toEqual({
      orderHref: "/en/checkout?service=icloud-clean",
      serviceHref: "/en/services/icloud-clean",
    });
  });

  it("has no order form to offer for a service that is no longer listed, and sends the rank back to the service list", () => {
    expect(sessionPriceList(merchant, null)).toEqual({ orderHref: null, serviceHref: "/en/services" });
  });

  it("never leads to the retired price list", () => {
    expect(JSON.stringify(sessionPriceList(merchant, "x"))).not.toContain("/account/services");
  });

  it("gives a retail rank, a visitor who is signed out and an account that was not read no notice", () => {
    expect(sessionPriceList(retail, "icloud-clean")).toBeNull();
    expect(sessionPriceList(null, "icloud-clean")).toBeNull();
    expect(sessionPriceList(undefined, "icloud-clean")).toBeNull();
  });

  it("fails closed: only the exact word merchant gets the notice", () => {
    for (const kind of ["partner", "", "Merchant", undefined, null]) {
      expect(sessionPriceList({ rank: { kind } }, "x"), String(kind)).toBeNull();
    }
    expect(sessionPriceList({}, "x")).toBeNull();
  });
});

describe("addresses", () => {
  it("the checkout address of a service is the same for every buyer, its slug encoded", () => {
    expect(checkoutHref("icloud-clean")).toBe("/en/checkout?service=icloud-clean");
    expect(checkoutHref("a b&c")).toBe("/en/checkout?service=a%20b%26c");
  });

  it("comes back to the page after sign-in with no account type, whoever signs in", () => {
    const href = checkoutSignInHref("/en/checkout?service=icloud-clean&quantity=3");
    expect(href).toBe("/en/sign-in?next=%2Fen%2Fcheckout%3Fservice%3Dicloud-clean%26quantity%3D3");
    expect(href).not.toContain("as=");
    expect(new URL(href, "http://x").searchParams.get("next")).toBe("/en/checkout?service=icloud-clean&quantity=3");
  });
});
