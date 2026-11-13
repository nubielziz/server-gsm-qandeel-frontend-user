import { describe, expect, it } from "vitest";
import { common } from "@/lib/i18n/messages/common";
import { store } from "@/lib/i18n/messages/store";
import { serviceCardLabels, priceNotes } from "./card-labels";

// The rules of the demo fixtures (e2e/global-setup.ts) and the BH §14.2 table.
const SINGLE = { min: 1, max: 1, options: [] };
const RANGE = { min: 2, max: 50, options: [] };
const RANGE_FROM_ONE = { min: 1, max: 10, options: [] };
const PACKS = { min: 5, max: 25, options: [5, 10, 25] };
const PACKS_FROM_ONE = { min: 1, max: 10, options: [1, 5, 10] };
const EXACT = { min: 5, max: 5, options: [] };
const ONE_PACK = { min: 10, max: 10, options: [10] };

describe("priceNotes: what goes under the unit price", () => {
  it("one per order: the price alone", () => {
    expect(priceNotes("3.9900", SINGLE)).toEqual({ perUnit: false, from: null, exact: null, packs: [] });
  });

  it("a range above 1: per unit and From unit x min", () => {
    expect(priceNotes("14.9900", RANGE)).toEqual({ perUnit: true, from: "29.9800", exact: null, packs: [] });
  });

  it("a range that starts at 1: per unit, and no From (it would repeat the price)", () => {
    expect(priceNotes("14.9900", RANGE_FROM_ONE)).toEqual({ perUnit: true, from: null, exact: null, packs: [] });
  });

  it("packs: per unit, From the smallest pack and every pack with its estimate, smallest first", () => {
    expect(priceNotes("12.9900", PACKS)).toEqual({
      perUnit: true,
      from: "64.9500",
      exact: null,
      packs: [
        { count: 5, amount: "64.9500" },
        { count: 10, amount: "129.9000" },
        { count: 25, amount: "324.7500" },
      ],
    });
  });

  it("packs that include 1: no From, the packs are still listed", () => {
    const notes = priceNotes("2.5000", PACKS_FROM_ONE);
    expect(notes.from).toBeNull();
    expect(notes.packs.map((pack) => pack.count)).toEqual([1, 5, 10]);
  });

  it("exactly N: per unit and N for unit x N, no From, no packs", () => {
    expect(priceNotes("21.9900", EXACT)).toEqual({ perUnit: true, from: null, exact: { count: 5, amount: "109.9500" }, packs: [] });
  });

  it("a single pack is an exact N", () => {
    expect(priceNotes("1.2500", ONE_PACK)).toEqual({ perUnit: true, from: null, exact: { count: 10, amount: "12.5000" }, packs: [] });
  });

  it("works with integer math: no float drift", () => {
    expect(priceNotes("0.1000", { min: 3, max: 9, options: [] }).from).toBe("0.3000");
    expect(priceNotes("1.2500", { min: 5, max: 25, options: [5, 10, 25] }).from).toBe("6.2500");
  });

  it("a price that is not a money string leaves the amounts out instead of throwing", () => {
    expect(priceNotes("abc", RANGE)).toEqual({ perUnit: true, from: null, exact: null, packs: [] });
  });
});

describe("serviceCardLabels", () => {
  it("carries the In stock badge text in both languages, from the shop namespace", () => {
    const en = serviceCardLabels(store.en, common.en);
    const ar = serviceCardLabels(store.ar, common.ar);
    expect(en.inStock).toBe("In stock");
    expect(ar.inStock).toBe("متوفر");
    expect(en.types.imei).toBe(common.en.serviceType.imei);
    expect(ar.delivery).toContain("{time}");
  });

  it("never uses the words the owner decided against, in either language, on any service string", () => {
    const text = JSON.stringify([store.en.card, store.en.service, store.en.quickView, store.ar.card, store.ar.service, store.ar.quickView]);
    expect(text).not.toMatch(/pre-?order|out of stock|sold out|left in stock|طلب مسبق|نفدت/i);
  });
});
