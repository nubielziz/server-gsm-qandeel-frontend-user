import { describe, expect, it } from "vitest";
import { newTicketHref, orderParam } from "./new-ticket-link";

describe("newTicketHref: the new-ticket form of the surface, with the closed ticket's order where it can take it", () => {
  it("a guest goes to the public form, without the order (its field takes a tracking link, not an id)", () => {
    expect(newTicketHref("en", "guest", 12)).toBe("/en/support");
    expect(newTicketHref("en", "guest", null)).toBe("/en/support");
  });

  it("a signed-in customer goes to the account form with the order", () => {
    expect(newTicketHref("en", "customer", 12)).toBe("/en/account/tickets/new?order=12");
    expect(newTicketHref("en", "customer", null)).toBe("/en/account/tickets/new");
  });

  it("a merchant goes to the portal form with the order", () => {
    expect(newTicketHref("en", "merchant", 7)).toBe("/en/merchant/support/new?order=7");
    expect(newTicketHref("en", "merchant", null)).toBe("/en/merchant/support/new");
  });

  it("never carries an id that is not a positive whole number", () => {
    expect(newTicketHref("en", "merchant", 0)).toBe("/en/merchant/support/new");
    expect(newTicketHref("en", "merchant", 1.5)).toBe("/en/merchant/support/new");
  });
});

describe("orderParam: the order id of ?order=", () => {
  it("reads a positive whole number, the first of several", () => {
    expect(orderParam("12")).toBe(12);
    expect(orderParam(["7", "8"])).toBe(7);
  });

  it("ignores anything else", () => {
    for (const value of [undefined, "", "0", "-3", "1.5", "12abc", "t_4056k559090000000000", "99999999999999999"]) {
      expect(orderParam(value)).toBeNull();
    }
  });
});
