import { describe, expect, it } from "vitest";
import { createdTicketHref, newTicketHref, orderParam } from "./new-ticket-link";

describe("newTicketHref: the new-ticket form of the visitor, with the closed ticket's order where it can take it", () => {
  it("a guest goes to the public form, without the order (its field takes a tracking link, not an id)", () => {
    expect(newTicketHref(false, 12)).toBe("/en/support");
    expect(newTicketHref(false, null)).toBe("/en/support");
  });

  it("a signed-in account goes to the account form with the order", () => {
    expect(newTicketHref(true, 7)).toBe("/en/account/support/new?order=7");
    expect(newTicketHref(true, 12)).toBe("/en/account/support/new?order=12");
    expect(newTicketHref(true, null)).toBe("/en/account/support/new");
  });

  it("never names an old ticket address", () => {
    for (const orderId of [null, 7]) {
      expect(newTicketHref(true, orderId)).not.toContain("/merchant");
      expect(newTicketHref(true, orderId)).not.toContain("/account/tickets");
    }
  });

  it("never carries an id that is not a positive whole number", () => {
    expect(newTicketHref(true, 0)).toBe("/en/account/support/new");
    expect(newTicketHref(true, 1.5)).toBe("/en/account/support/new");
    expect(newTicketHref(true, -4)).toBe("/en/account/support/new");
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

describe("createdTicketHref: where a ticket just opened is read", () => {
  it("a retail account goes to the token page, with the token encoded", () => {
    expect(createdTicketHref("store", { token: "abc_DEF-1", id: 9 })).toBe("/en/support/tickets/abc_DEF-1");
    expect(createdTicketHref("store", { token: "a/b c" })).toBe("/en/support/tickets/a%2Fb%20c");
  });

  it("a merchant rank goes to its own thread by id", () => {
    expect(createdTicketHref("client", { id: 42, token: "ignored" })).toBe("/en/account/support/42");
  });

  it("gives nothing when the answer holds nothing to open", () => {
    expect(createdTicketHref("store", { id: 9 })).toBeNull();
    expect(createdTicketHref("store", { token: "" })).toBeNull();
    expect(createdTicketHref("client", { token: "abc" })).toBeNull();
    expect(createdTicketHref("client", { id: 0 })).toBeNull();
    expect(createdTicketHref("client", { id: 1.5 })).toBeNull();
  });
});
