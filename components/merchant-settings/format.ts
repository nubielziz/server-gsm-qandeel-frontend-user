// Small display helpers for the merchant settings pages. Pure: safe in Server and Client Components.
// Dates are shown in UTC with a label: the server renders the pages and does not know the visitor's time zone, and
// a fixed zone keeps server and browser output identical (no hydration mismatch).
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";

/** "Nov 9, 2026, 6:22 PM UTC" */
export function utcDateTime(iso: string, locale: Locale, utcLabel: string): string {
  // Arabic uses the 24-hour clock: no "م/ص" marker, so the whole value reads as one left-to-right run of digits.
  const options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" };
  if (locale === "ar") options.hourCycle = "h23";
  return `${formatDate(iso, locale, options)} ${utcLabel}`;
}

/** "Nov 9, 2026" (the calendar day in UTC). */
export function utcDate(iso: string, locale: Locale): string {
  return formatDate(iso, locale, { dateStyle: "medium", timeZone: "UTC" });
}

/** "March 2025" (month and year in UTC). */
export function utcMonth(iso: string, locale: Locale): string {
  return formatDate(iso, locale, { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "50.0000" → "50", "12.5000" → "12.5": the stored 4-decimal money string as a person would type it. */
export function trimMoney(amount: string): string {
  return amount.includes(".") ? amount.replace(/\.?0+$/, "") : amount;
}

/** True when a money input is empty or a non-negative amount with up to 4 decimals. */
export function isMoneyInput(value: string): boolean {
  return /^\d{1,12}(\.\d{1,4})?$/.test(value.trim());
}

/** 1536 → "2 KB", 5242880 → "5.0 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** True when the time is already behind us (an expired key). Call on the server, per request. */
export function isPast(iso: string): boolean {
  return Date.parse(iso) < Date.now();
}
