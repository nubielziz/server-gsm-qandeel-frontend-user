// Quantity rules of a service: how many units one order holds, which control that needs, and the sentences that
// say so (handoff BH §13 and §14.2). One module for the checkout, the service page, the quick view and the merchant
// order form. Pure, no React, safe to import anywhere.
//
// The rule is `{ min, max, options }` (the store's `quantity`; the merchant API calls it `minQty`, `maxQty`,
// `qtyOptions`, see `fromMerchantRule`). Decision order (plan D17):
//   1. two or more `options`  → packs: only these quantities, never a free number box;
//   2. one pack, or min === max → "exact N": no control;
//   3. N is 1                 → "single" (the default of a new service);
//   4. otherwise              → a range: a whole number from min to max.
import { intlLocaleOf, type Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import type { CommonMessages } from "@/lib/i18n/messages/common";
import { mulMoney } from "@/lib/merchant/money-math";

/** The quantity the API accepts on the wire: a whole number from 1 to 100,000 (BH §14.5). */
export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 100000;

/** The rule of one service. `options` is the list of fixed packs; empty means any whole number from `min` to `max`. */
export type QuantityRule = { min: number; max: number; options: readonly number[] };

export type QuantityMode =
  /** One per order: no control. */
  | { kind: "single" }
  /** Exactly N per order (N above 1): no control. */
  | { kind: "exact"; value: number }
  /** A whole number from `min` to `max`: a bounded number box. */
  | { kind: "range"; min: number; max: number }
  /** Only these quantities, ascending: radio buttons or a select. */
  | { kind: "packs"; options: number[] };

/** The `common.quantity` message group (the texts of this module). */
export type QuantityMessages = CommonMessages["quantity"];

function isWhole(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_QUANTITY;
}

/** The packs of a rule: whole numbers only, ascending, each once. */
function packsOf(rule: QuantityRule): number[] {
  return Array.from(new Set(rule.options.filter(isWhole))).sort((a, b) => a - b);
}

/** Which control a rule needs (BH §14.2). */
export function quantityMode(rule: QuantityRule): QuantityMode {
  const packs = packsOf(rule);
  if (packs.length >= 2) return { kind: "packs", options: packs };
  const exact = packs.length === 1 ? packs[0] : rule.min >= rule.max ? rule.min : null;
  if (exact !== null) {
    const value = isWhole(exact) ? exact : MIN_QUANTITY;
    return value === 1 ? { kind: "single" } : { kind: "exact", value };
  }
  return { kind: "range", min: rule.min, max: rule.max };
}

/** The quantity a request without `quantity` orders, and what the control starts with: `min`, the smallest pack. */
export function defaultQuantity(rule: QuantityRule): number {
  const mode = quantityMode(rule);
  switch (mode.kind) {
    case "single":
      return 1;
    case "exact":
      return mode.value;
    case "range":
      return mode.min;
    case "packs":
      return mode.options[0];
  }
}

/** True when the rule accepts `n`: a pack for packs, the one value for exact and single, else within min and max. */
export function isAllowedQuantity(rule: QuantityRule, n: number): boolean {
  if (!isWhole(n) || n > MAX_QUANTITY) return false;
  const mode = quantityMode(rule);
  switch (mode.kind) {
    case "single":
      return n === 1;
    case "exact":
      return n === mode.value;
    case "range":
      return n >= mode.min && n <= mode.max;
    case "packs":
      return mode.options.includes(n);
  }
}

/**
 * Reads a quantity a person typed: a whole number from 1 to 100,000, nothing else (no sign, no decimals, no
 * separators). Arabic-Indic (U+0660 to U+0669) and Persian (U+06F0 to U+06F9) digits are accepted: an Arabic keyboard
 * types them (group C, decision 039). Returns null when it is not such a number.
 * It does not check the service's rule: that is `isAllowedQuantity`.
 */
export function parseQuantityInput(text: string): number | null {
  const latin = text
    .trim()
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  if (!/^\d+$/.test(latin)) return null;
  const n = Number(latin);
  return Number.isSafeInteger(n) && n >= MIN_QUANTITY && n <= MAX_QUANTITY ? n : null;
}

/**
 * Keeps the wanted quantity when the rule still allows it, else falls back to the default and says so:
 * `coerceQuantity(packs 20/40, 10)` → `{ quantity: 20, changed: true }`. Nothing wanted (`null`, `undefined`, no
 * `?quantity=`) is the default with `changed: false`, so no notice is shown.
 */
export function coerceQuantity(
  rule: QuantityRule,
  wanted: number | null | undefined,
): { quantity: number; changed: boolean } {
  if (wanted === null || wanted === undefined) return { quantity: defaultQuantity(rule), changed: false };
  if (isAllowedQuantity(rule, wanted)) return { quantity: wanted, changed: false };
  return { quantity: defaultQuantity(rule), changed: true };
}

/** The rule of a merchant service (`GET /client/services`): `minQty`, `maxQty`, `qtyOptions`. */
export function fromMerchantRule(service: { minQty: number; maxQty: number; qtyOptions: readonly number[] }): QuantityRule {
  return { min: service.minQty, max: service.maxQty, options: service.qtyOptions };
}

function formatCount(n: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocaleOf(locale)).format(n);
}

/** "5, 10, 25". */
function formatList(values: readonly number[], locale: Locale): string {
  return values.map((n) => formatCount(n, locale)).join(", ");
}

/**
 * The rule as a short line: "1 per order", "5 per order", "2 to 50 per order", "Packs of 5, 10, 25".
 * `t` is `common.quantity`.
 */
export function quantityRuleText(rule: QuantityRule, t: QuantityMessages, locale: Locale): string {
  const mode = quantityMode(rule);
  switch (mode.kind) {
    case "single":
      return t.one;
    case "exact":
      return fmt(t.exact, { count: formatCount(mode.value, locale) });
    case "range":
      return fmt(t.range, { min: formatCount(mode.min, locale), max: formatCount(mode.max, locale) });
    case "packs":
      return fmt(t.packs, { options: formatList(mode.options, locale) });
  }
}

/**
 * What to say when a quantity is refused, from the client check and from a server `422` on `quantity`
 * (`invalid_quantity`, `too_small`, `too_big`, `invalid_type`): the pack list, the range, or the one quantity the
 * service sells. `t` is `common.quantity`. The server's own message is English only and is never shown.
 */
export function invalidQuantityText(rule: QuantityRule, t: QuantityMessages, locale: Locale): string {
  const mode = quantityMode(rule);
  switch (mode.kind) {
    case "single":
      return fmt(t.invalidExact, { count: formatCount(1, locale) });
    case "exact":
      return fmt(t.invalidExact, { count: formatCount(mode.value, locale) });
    case "range":
      return fmt(t.invalidRange, { min: formatCount(mode.min, locale), max: formatCount(mode.max, locale) });
    case "packs":
      return fmt(t.invalidPacks, { options: formatList(mode.options, locale) });
  }
}

/**
 * The price of the smallest purchase (the "From" price): unit price × `defaultQuantity(rule)` as a 4-decimal string,
 * exact (BigInt, no floats). `fromPrice("1.2500", packs 5/10/25)` → `"6.2500"`. It is an estimate: the checkout
 * session works the tax once on the whole net, so a cent can differ (BH §14.3). Throws for a malformed price, like
 * `mulMoney`.
 */
export function fromPrice(unitGross: string, rule: QuantityRule): string {
  return mulMoney(unitGross, defaultQuantity(rule));
}
