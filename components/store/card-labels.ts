// What the shop's service views say, in pure form: the labels a ServiceCard needs (from the shop and shared message
// namespaces) and the price notes of the service page and the quick view ("per unit", "From", "5 for", the packs).
// No React, no server access: safe to import anywhere and to unit-test.
import type { CommonMessages } from "@/lib/i18n/messages/common";
import type { StoreMessages } from "@/lib/i18n/messages/store";
import { mulMoney } from "@/lib/merchant/money-math";
import { defaultQuantity, quantityMode, type QuantityRule } from "@/lib/quantity";
import type { ServiceCardLabels } from "./service-card";

export function serviceCardLabels(t: StoreMessages, common: CommonMessages): ServiceCardLabels {
  return {
    orderNow: t.card.orderNow,
    delivery: t.card.delivery,
    orderService: t.card.orderService,
    quickView: t.card.quickView,
    inStock: t.card.inStock,
    types: common.serviceType,
  };
}

/** One purchase the page names a price for: `count` units for about `amount` (a 4-decimal string in the shown currency). */
export type PriceNote = { count: number; amount: string };

/** What goes under the unit price of the service page and the quick view (BH §13, §14.3). */
export type PriceNotes = {
  /** Say "per unit" next to the price: every quantity mode except one per order. */
  perUnit: boolean;
  /** The price of the smallest purchase ("From …"): packs and a range whose smallest quantity is above 1; else null. */
  from: string | null;
  /** Exactly N per order: "{N} for {price}"; else null. */
  exact: PriceNote | null;
  /** Packs, smallest first, each with its estimate ("10 for about …"); empty unless the service is sold in packs. */
  packs: PriceNote[];
};

const NO_NOTES: PriceNotes = { perUnit: false, from: null, exact: null, packs: [] };

/**
 * The notes under a unit price, from the service's quantity rule: nothing for one per order; "per unit" and
 * "{N} for {price × N}" for exactly N; "per unit" and "From {price × min}" for a range above 1; "per unit", "From" and
 * each pack's estimate for packs. Amounts are unit × quantity, exact (BigInt), and an estimate: the checkout works the
 * tax once on the whole net, so a cent can differ (BH §14.3). `unitGross` is the price shown for one unit.
 */
export function priceNotes(unitGross: string, rule: QuantityRule): PriceNotes {
  const mode = quantityMode(rule);
  if (mode.kind === "single") return NO_NOTES;
  try {
    const smallest = defaultQuantity(rule);
    const from = smallest > 1 ? mulMoney(unitGross, smallest) : null;
    switch (mode.kind) {
      case "exact":
        return { perUnit: true, from: null, exact: { count: mode.value, amount: mulMoney(unitGross, mode.value) }, packs: [] };
      case "range":
        return { perUnit: true, from, exact: null, packs: [] };
      case "packs":
        return {
          perUnit: true,
          from,
          exact: null,
          packs: mode.options.map((count) => ({ count, amount: mulMoney(unitGross, count) })),
        };
    }
  } catch {
    // A price that is not a money string (never from the API): say "per unit" and leave the amounts out.
    return { ...NO_NOTES, perUnit: true };
  }
}
