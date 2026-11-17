import { describe, expect, it } from "vitest";
import { plural } from "@/lib/i18n/define";
import { common } from "@/lib/i18n/messages/common";
import {
  coerceQuantity,
  defaultQuantity,
  fromMerchantRule,
  fromPrice,
  invalidQuantityText,
  isAllowedQuantity,
  parseQuantityInput,
  quantityMode,
  quantityRuleText,
  type QuantityRule,
} from "./quantity";

/** The rows of the mode table in BH §14.2 (merchant `minQty`, `maxQty`, `qtyOptions` map onto min, max, options). */
const SINGLE: QuantityRule = { min: 1, max: 1, options: [] };
const RANGE: QuantityRule = { min: 2, max: 50, options: [] };
const PACKS: QuantityRule = { min: 5, max: 25, options: [5, 10, 25] };
const EXACT: QuantityRule = { min: 5, max: 5, options: [] };
const ONE_PACK: QuantityRule = { min: 10, max: 10, options: [10] };

const en = common.quantity;

describe("quantityMode (BH §14.2)", () => {
  it("one per order is single", () => {
    expect(quantityMode(SINGLE)).toEqual({ kind: "single" });
  });
  it("a range has min and max", () => {
    expect(quantityMode(RANGE)).toEqual({ kind: "range", min: 2, max: 50 });
  });
  it("two or more packs are packs, whatever min and max say", () => {
    expect(quantityMode(PACKS)).toEqual({ kind: "packs", options: [5, 10, 25] });
    expect(quantityMode({ min: 1, max: 100, options: [5, 10] })).toEqual({ kind: "packs", options: [5, 10] });
  });
  it("a range whose smallest equals its largest is exactly N", () => {
    expect(quantityMode(EXACT)).toEqual({ kind: "exact", value: 5 });
  });
  it("a single pack is exact, and a single pack of 1 is single", () => {
    expect(quantityMode(ONE_PACK)).toEqual({ kind: "exact", value: 10 });
    expect(quantityMode({ min: 1, max: 1, options: [1] })).toEqual({ kind: "single" });
  });
  it("sorts the packs and ignores duplicates and values that are not whole quantities", () => {
    expect(quantityMode({ min: 5, max: 25, options: [25, 5, 10, 5] })).toEqual({ kind: "packs", options: [5, 10, 25] });
    expect(quantityMode({ min: 2, max: 9, options: [0, -3, 2.5] })).toEqual({ kind: "range", min: 2, max: 9 });
  });
  it("reads a merchant rule the same way", () => {
    expect(quantityMode(fromMerchantRule({ minQty: 5, maxQty: 25, qtyOptions: [5, 10, 25] }))).toEqual({
      kind: "packs",
      options: [5, 10, 25],
    });
    expect(fromMerchantRule({ minQty: 2, maxQty: 50, qtyOptions: [] })).toEqual(RANGE);
    expect(quantityMode(fromMerchantRule({ minQty: 7, maxQty: 7, qtyOptions: [] }))).toEqual({ kind: "exact", value: 7 });
  });
});

describe("defaultQuantity", () => {
  it("is min, the smallest pack, or the one allowed value", () => {
    expect(defaultQuantity(SINGLE)).toBe(1);
    expect(defaultQuantity(RANGE)).toBe(2);
    expect(defaultQuantity(PACKS)).toBe(5);
    expect(defaultQuantity(EXACT)).toBe(5);
    expect(defaultQuantity(ONE_PACK)).toBe(10);
    expect(defaultQuantity({ min: 5, max: 25, options: [25, 10, 5] })).toBe(5);
  });
});

describe("isAllowedQuantity", () => {
  it("single and exact accept only their value", () => {
    expect(isAllowedQuantity(SINGLE, 1)).toBe(true);
    expect(isAllowedQuantity(SINGLE, 2)).toBe(false);
    expect(isAllowedQuantity(EXACT, 5)).toBe(true);
    expect(isAllowedQuantity(EXACT, 4)).toBe(false);
    expect(isAllowedQuantity(ONE_PACK, 10)).toBe(true);
  });
  it("a range accepts whole numbers from min to max", () => {
    expect(isAllowedQuantity(RANGE, 2)).toBe(true);
    expect(isAllowedQuantity(RANGE, 50)).toBe(true);
    expect(isAllowedQuantity(RANGE, 1)).toBe(false);
    expect(isAllowedQuantity(RANGE, 51)).toBe(false);
    expect(isAllowedQuantity(RANGE, 2.5)).toBe(false);
  });
  it("packs accept only the packs, not the numbers between them", () => {
    expect(isAllowedQuantity(PACKS, 10)).toBe(true);
    expect(isAllowedQuantity(PACKS, 7)).toBe(false);
    expect(isAllowedQuantity(PACKS, 30)).toBe(false);
  });
  it("refuses what is not a whole quantity", () => {
    for (const bad of [0, -1, NaN, Infinity, 100001]) expect(isAllowedQuantity({ min: 1, max: 200000, options: [] }, bad)).toBe(false);
  });
});

describe("parseQuantityInput", () => {
  it("reads whole numbers from 1 to 100000", () => {
    expect(parseQuantityInput("1")).toBe(1);
    expect(parseQuantityInput(" 25 ")).toBe(25);
    expect(parseQuantityInput("100000")).toBe(100000);
    expect(parseQuantityInput("007")).toBe(7);
  });
  it("accepts Arabic-Indic and Persian digits", () => {
    expect(parseQuantityInput("٣")).toBe(3);
    expect(parseQuantityInput("١٢٠")).toBe(120);
    expect(parseQuantityInput("۴۵")).toBe(45);
  });
  it("refuses everything else", () => {
    for (const bad of ["", "  ", "0", "-1", "+5", "2.5", "2٫5", "1,000", "1 000", "100001", "abc", "5a", "1e3", "٣a", "99999999999999999999"]) {
      expect(parseQuantityInput(bad), bad).toBeNull();
    }
  });
});

describe("coerceQuantity", () => {
  it("keeps a quantity the rule still allows", () => {
    expect(coerceQuantity(PACKS, 10)).toEqual({ quantity: 10, changed: false });
    expect(coerceQuantity(RANGE, 3)).toEqual({ quantity: 3, changed: false });
  });
  it("falls back to the default and says so when the quantity is no longer allowed", () => {
    expect(coerceQuantity({ min: 20, max: 40, options: [20, 40] }, 10)).toEqual({ quantity: 20, changed: true });
    expect(coerceQuantity(RANGE, 60)).toEqual({ quantity: 2, changed: true });
    expect(coerceQuantity(SINGLE, 3)).toEqual({ quantity: 1, changed: true });
    expect(coerceQuantity(EXACT, 1)).toEqual({ quantity: 5, changed: true });
  });
  it("is the default, with no notice, when nothing was wanted", () => {
    expect(coerceQuantity(RANGE, null)).toEqual({ quantity: 2, changed: false });
    expect(coerceQuantity(PACKS, undefined)).toEqual({ quantity: 5, changed: false });
  });
});

describe("quantityRuleText", () => {
  it("says the rule in English", () => {
    expect(quantityRuleText(SINGLE, en)).toBe("1 per order");
    expect(quantityRuleText(EXACT, en)).toBe("5 per order");
    expect(quantityRuleText(ONE_PACK, en)).toBe("10 per order");
    expect(quantityRuleText(RANGE, en)).toBe("2 to 50 per order");
    expect(quantityRuleText(PACKS, en)).toBe("Packs of 5, 10, 25");
  });
  it("groups the digits of large numbers", () => {
    expect(quantityRuleText({ min: 1, max: 100000, options: [] }, en)).toBe("1 to 100,000 per order");
  });
});

describe("invalidQuantityText (BH §14.6)", () => {
  it("packs: lists the packs", () => {
    expect(invalidQuantityText(PACKS, en)).toBe("Choose one of these quantities: 5, 10, 25.");
  });
  it("range: names the bounds", () => {
    expect(invalidQuantityText(RANGE, en)).toBe("Enter a quantity from 2 to 50.");
  });
  it("exactly N and one per order: names the one quantity, never a range from N to N", () => {
    expect(invalidQuantityText(EXACT, en)).toBe("This service sells 5 per order.");
    expect(invalidQuantityText(SINGLE, en)).toBe("This service sells 1 per order.");
    expect(invalidQuantityText(EXACT, en)).not.toMatch(/from 5 to 5/);
  });
  it("is built from the rule after a re-read, not from the old one", () => {
    expect(invalidQuantityText({ min: 20, max: 40, options: [20, 40] }, en)).toBe("Choose one of these quantities: 20, 40.");
  });
});

describe("fromPrice", () => {
  it("is the unit price times the smallest purchase, exactly", () => {
    expect(fromPrice("1.2500", PACKS)).toBe("6.2500");
    expect(fromPrice("3.9900", RANGE)).toBe("7.9800");
    expect(fromPrice("1.0000", EXACT)).toBe("5.0000");
    expect(fromPrice("12.4900", SINGLE)).toBe("12.4900");
  });
  it("does not drift like a float would", () => {
    expect(fromPrice("0.1000", { min: 3, max: 9, options: [] })).toBe("0.3000");
  });
  it("throws for a malformed price rather than showing a wrong one", () => {
    expect(() => fromPrice("free", RANGE)).toThrow();
  });
});

describe("the strings of common.quantity", () => {
  it("keeps the placeholders the code fills", () => {
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
    const expected = {
      one: "",
      exact: "{count}",
      range: "{max},{min}",
      packs: "{options}",
      invalidRange: "{max},{min}",
      invalidPacks: "{options}",
      invalidExact: "{count}",
      perUnit: "",
      from: "{price}",
      exactFor: "{count},{price}",
      packFor: "{count},{price}",
      estimated: "",
    } as const;
    for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
      expect(placeholders(en[key]), key).toBe(expected[key]);
    }
  });
  it("builds the subtotal label with the plural forms", () => {
    expect(plural(1, en.subtotal)).toBe("Subtotal (1 unit)");
    expect(plural(3, en.subtotal)).toBe("Subtotal (3 units)");
  });
  it("uses the handoff's own wording (BH §14.6)", () => {
    expect(en.invalidRange).toBe("Enter a quantity from {min} to {max}.");
    expect(en.invalidPacks).toBe("Choose one of these quantities: {options}.");
  });
});
