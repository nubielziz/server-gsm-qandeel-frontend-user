import { describe, expect, it } from "vitest";
import { common } from "@/lib/i18n/messages/common";
import { portal } from "@/lib/i18n/messages/portal";
import { store } from "@/lib/i18n/messages/store";
import type { QuantityRule } from "@/lib/quantity";
import { deliveryLine, deliveryTime, stockHint } from "./delivery";

const en = common.delivery;

const RANGE: QuantityRule = { min: 2, max: 50, options: [] };
const PACKS: QuantityRule = { min: 5, max: 25, options: [5, 10, 25] };
const EXACT: QuantityRule = { min: 5, max: 5, options: [] };
const SINGLE: QuantityRule = { min: 1, max: 1, options: [] };

describe("deliveryTime", () => {
  it("a staff note wins over the minutes, trimmed and as written", () => {
    expect(deliveryTime({ etaText: "  Delivered from 1 December ", deliveryMinutes: 90 })).toEqual({
      text: "Delivered from 1 December",
      isNote: true,
    });
  });
  it("formats the minutes in English when there is no note", () => {
    expect(deliveryTime({ etaText: "", deliveryMinutes: 90 })).toEqual({ text: "1 hr 30 min", isNote: false });
    expect(deliveryTime({ etaText: "   ", deliveryMinutes: 5 })).toEqual({ text: "5 min", isNote: false });
    expect(deliveryTime({ deliveryMinutes: 2880 })).toEqual({ text: "2 days", isNote: false });
  });
  it("has no text when the service has no delivery information", () => {
    expect(deliveryTime({})).toEqual({ text: "", isNote: false });
    expect(deliveryTime({ etaText: null, deliveryMinutes: null })).toEqual({ text: "", isNote: false });
    expect(deliveryTime({ etaText: "", deliveryMinutes: 0 }).text).toBe("");
    expect(deliveryTime({ etaText: "", deliveryMinutes: NaN }).text).toBe("");
  });
  it("rounds a fractional number of minutes", () => {
    expect(deliveryTime({ deliveryMinutes: 4.6 }).text).toBe("5 min");
  });
});

describe("deliveryLine", () => {
  it("prints the note as written, without a prefix", () => {
    expect(deliveryLine({ etaText: "Ships Monday", deliveryMinutes: 60 }, en)).toBe("Ships Monday");
  });
  it("says 'Delivered within …' for minutes", () => {
    expect(deliveryLine({ etaText: "", deliveryMinutes: 90 }, en)).toBe("Delivered within 1 hr 30 min");
  });
  it("is empty when there is nothing to say", () => {
    expect(deliveryLine({ etaText: "", deliveryMinutes: 0 }, en)).toBe("");
  });
});

describe("stockHint", () => {
  const base = { etaText: "", deliveryMinutes: 90 };

  it("an in-stock range or packs service says stock is instant while it lasts, otherwise the delivery time", () => {
    expect(stockHint({ ...base, availability: "in_stock", quantity: RANGE }, en)).toBe(
      "Instant delivery while stock lasts, otherwise within 1 hr 30 min",
    );
    expect(stockHint({ ...base, availability: "in_stock", quantity: PACKS }, en)).toBe(
      "Instant delivery while stock lasts, otherwise within 1 hr 30 min",
    );
  });
  it("uses the staff note instead of the minutes when there is one", () => {
    expect(stockHint({ etaText: "Within one working day", deliveryMinutes: 90, availability: "in_stock", quantity: RANGE }, en)).toBe(
      "Instant delivery while stock lasts. Otherwise: Within one working day",
    );
  });
  it("has no hint for on request, one per order, exactly N, or without delivery information", () => {
    expect(stockHint({ ...base, availability: "on_request", quantity: RANGE }, en)).toBeNull();
    expect(stockHint({ ...base, availability: "in_stock", quantity: SINGLE }, en)).toBeNull();
    expect(stockHint({ ...base, availability: "in_stock", quantity: EXACT }, en)).toBeNull();
    expect(stockHint({ etaText: "", deliveryMinutes: 0, availability: "in_stock", quantity: RANGE }, en)).toBeNull();
  });
  it("never shows a stock number", () => {
    const hint = stockHint({ ...base, availability: "in_stock", quantity: PACKS }, en) ?? "";
    expect(hint).not.toMatch(/\b(left|only \d+|\d+ in stock)\b/i);
  });
});

describe("shared strings (F01)", () => {
  const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");

  it("the delivery group carries the placeholders the code fills", () => {
    const expected = { label: "", within: "{time}", whileStock: "{time}", whileStockNote: "{note}" } as const;
    expect(Object.keys(common.delivery)).toEqual(Object.keys(expected));
    for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
      expect(placeholders(common.delivery[key]), key).toBe(expected[key]);
    }
  });
  it("uses the handoff's wording for availability and delivery (BH §14.4)", () => {
    expect(common.availability).toEqual({ inStock: "In stock", onRequest: "On request", instant: "Instant delivery" });
    expect(common.delivery.within).toBe("Delivered within {time}");
  });
  it("never says pre-order or out of stock", () => {
    const all = JSON.stringify([common.availability, common.delivery]);
    expect(all).not.toMatch(/pre-?order|out of stock/i);
  });
  it("keeps the tracking texts the e2e specs read, and the pending text promises no time", () => {
    expect(store.track.timeline.created).toBe("Order received");
    expect(store.track.pendingText).not.toMatch(/shortly|within|minutes?|hours?|days?|\d/i);
  });
  it("translates the timeline events by type, in the handoff's words (BH §14.4)", () => {
    expect(store.track.timeline).toMatchObject({
      accepted: "Your order is being worked on",
      rejected: "We could not complete this order",
      refund: "Refunded",
      reopened: "Being checked again",
    });
  });
  it("has the navigation, wallet and notification labels for both areas", () => {
    expect(portal.merchantNav.notifications).toBe("Notifications");
    expect(portal.customerNav.wallet).toBe("Wallet");
    expect(portal.customerNav.notifications).toBe("Notifications");
    expect(portal.storeBalance).toBe("Store balance");
    expect(common.header).toMatchObject({ notifications: "Notifications", storeBalance: "Store balance", myWallet: "Wallet" });
    expect(common.nav).toMatchObject({ allCategories: "All categories", categories: "Categories" });
  });
  it("labels every top-up status", () => {
    const statuses = ["awaiting_payment", "in_review", "credited", "rejected", "cancelled"];
    expect(Object.keys(common.status.topUp)).toEqual(statuses);
  });
});
