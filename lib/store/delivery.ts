// How a store service says when it is delivered (BH §14.4, §14.5). The API gives two things per page: `etaText`, a
// staff note already in the page's language (may be `''`), and `deliveryMinutes`, which the site formats per language.
// `deliveryTime` (English, or the supplier's own words) is for old clients and is not used here. Pure, safe to import
// anywhere. Never says "Pre-order" or "Out of stock", and never shows a stock number.
import type { Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import type { CommonMessages } from "@/lib/i18n/messages/common";
import { formatMinutes } from "@/lib/merchant/format";
import { quantityMode, type QuantityRule } from "@/lib/quantity";

/** The `common.delivery` message group (the texts of this module). */
export type DeliveryMessages = CommonMessages["delivery"];

/** The two delivery fields of a store card or service page. Both may be missing on data that did not come from the API. */
export type DeliveryFields = { etaText?: string | null; deliveryMinutes?: number | null };

/** `isNote` is true when `text` is the staff's own sentence (shown as written), false when it is a formatted duration. */
export type DeliveryTime = { text: string; isNote: boolean };

/**
 * The delivery time of a service: the trimmed `etaText` when it is not empty, else `deliveryMinutes` formatted in the
 * page's language ("1 hr 30 min"). With neither (no note, no positive number of minutes) `text` is `''`, so a caller
 * can hide the row.
 */
export function deliveryTime(service: DeliveryFields, locale: Locale): DeliveryTime {
  const note = service.etaText?.trim();
  if (note) return { text: note, isNote: true };
  const minutes = service.deliveryMinutes;
  if (typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0) {
    return { text: formatMinutes(Math.round(minutes), locale), isNote: false };
  }
  return { text: "", isNote: false };
}

/**
 * The delivery line: the staff note as written, else "Delivered within 1 hr 30 min". `''` when the
 * service has no delivery information. `t` is `common.delivery`.
 */
export function deliveryLine(service: DeliveryFields, locale: Locale, t: DeliveryMessages): string {
  const { text, isNote } = deliveryTime(service, locale);
  if (!text) return "";
  return isNote ? text : fmt(t.within, { time: text });
}

/**
 * The hint for an `in_stock` service sold as a range or packs: "in_stock" speaks only for the smallest order, a larger
 * quantity can still be delivered later (BH §14.5), and the site has no stock count to warn with. `null` for every
 * other service (on request, one per order, exactly N) and when there is no delivery information to name the
 * "otherwise" part. `t` is `common.delivery`.
 */
export function stockHint(
  service: DeliveryFields & { availability: "in_stock" | "on_request"; quantity: QuantityRule },
  locale: Locale,
  t: DeliveryMessages,
): string | null {
  if (service.availability !== "in_stock") return null;
  const kind = quantityMode(service.quantity).kind;
  if (kind !== "range" && kind !== "packs") return null;
  const { text, isNote } = deliveryTime(service, locale);
  if (!text) return null;
  return isNote ? fmt(t.whileStockNote, { note: text }) : fmt(t.whileStock, { time: text });
}
