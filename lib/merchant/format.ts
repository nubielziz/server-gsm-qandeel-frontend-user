// Small display helpers for the merchant pages. Safe to import anywhere.
import { INTL_LOCALE } from "@/lib/i18n/config";

/** `90` → "1 hr, 30 min". Used for the services' delivery target (`slaMinutes`). */
export function formatMinutes(minutes: number): string {
  const tag = INTL_LOCALE;
  const parts: [number, "day" | "hour" | "minute"][] = [
    [Math.floor(minutes / 1440), "day"],
    [Math.floor((minutes % 1440) / 60), "hour"],
    [minutes % 60, "minute"],
  ];
  const shown = parts.filter(([n]) => n > 0);
  if (shown.length === 0) return new Intl.NumberFormat(tag, { style: "unit", unit: "minute", unitDisplay: "short" }).format(0);
  return shown
    .map(([n, unit]) => new Intl.NumberFormat(tag, { style: "unit", unit, unitDisplay: "short" }).format(n))
    .join(" ");
}

/** `order_hold` → "Order hold": a readable fallback for a ledger kind we have no translation for. */
export function humanizeKind(kind: string): string {
  const spaced = kind.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The label of a known key of a message group, else the humanized raw value. */
export function labelOf(labels: Record<string, string>, key: string): string {
  return labels[key] ?? humanizeKind(key);
}

/** `https://…` only: a payment URL from the API must never be `javascript:` or `data:`. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Wraps text that must stay left-to-right (amounts, percentages, IMEIs) in Unicode isolates, so it keeps its order when
 * it is inserted into a sentence: `fmt(t.priceChanged, { current: ltr(formatMoney(…)) })`.
 */
export function ltr(text: string): string {
  // Direction marks (U+200E, U+200F, U+061C) in the text would turn the number around again: they are removed first.
  return `\u2066${text.replace(/[\u200e\u200f\u061c]/g, "")}\u2069`;
}
