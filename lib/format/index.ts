// Display formatting. Money arrives as a 4-decimal string ("12.4900"): it is formatted from the
// string (Intl accepts exact decimal strings) and summed with integer math, never as floats. Safe to import anywhere.
import { INTL_LOCALE } from "@/lib/i18n/config";

type Num = number | `${number}` | string;

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
function nf(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const id = `n|${JSON.stringify(options)}`;
  let f = cache.get(id) as Intl.NumberFormat | undefined;
  if (!f) cache.set(id, (f = new Intl.NumberFormat(INTL_LOCALE, options)));
  return f;
}
function df(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const id = `d|${JSON.stringify(options)}`;
  let f = cache.get(id) as Intl.DateTimeFormat | undefined;
  if (!f) cache.set(id, (f = new Intl.DateTimeFormat(INTL_LOCALE, options)));
  return f;
}

/**
 * `formatMoney("12.4900", "USD")` → "$12.49". `decimals` comes from `/store/v1/config` currencies (0–4);
 * without it the currency's usual digits are used. Rounds half away from zero.
 */
export function formatMoney(amount: string, currency: string, decimals?: number): string {
  const options: Intl.NumberFormatOptions = { style: "currency", currency, currencyDisplay: "narrowSymbol" };
  if (decimals !== undefined) {
    options.minimumFractionDigits = decimals;
    options.maximumFractionDigits = decimals;
  }
  try {
    return nf(options).format(amount as Intl.StringNumericLiteral);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function formatNumber(value: Num, options: Intl.NumberFormatOptions = {}): string {
  return nf(options).format(value as Intl.StringNumericLiteral);
}

/** "15.0000" (a percent as a decimal string) → "15%". */
export function formatPercent(percent: string, maxDigits = 2): string {
  return `${nf({ maximumFractionDigits: maxDigits }).format(percent as Intl.StringNumericLiteral)}%`;
}

/**
 * Time zone used for every displayed date: the same on the server and in the browser, so rendering is deterministic
 * (no hydration mismatch, no server-timezone leak). Default UTC (the API's own zone); set NEXT_PUBLIC_TIME_ZONE
 * (e.g. "Asia/Amman") to show the business's local time instead.
 */
export const DISPLAY_TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || "UTC";

export function formatDate(iso: string, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : df({ timeZone: DISPLAY_TIME_ZONE, ...options }).format(d);
}

/** Date and time with the zone named ("Nov 9, 2026, 5:45 PM UTC"), so a time is never ambiguous. */
export function formatDateTime(iso: string): string {
  return formatDate(iso, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** Time of day with seconds and the zone named ("5:45:12 PM UTC"): for a deadline that is minutes away. */
export function formatTime(iso: string): string {
  return formatDate(iso, { hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
}

// ── Exact money math on 4-decimal strings (BigInt of ten-thousandths).
const ZERO = BigInt(0);
const SCALE = BigInt(10000);
function toUnits(amount: string): bigint {
  const m = /^(-)?(\d+)(?:\.(\d{1,4}))?$/.exec(amount.trim());
  if (!m) throw new Error(`Not a money string: ${amount}`);
  const units = BigInt(m[2]) * SCALE + BigInt((m[3] ?? "").padEnd(4, "0") || "0");
  return m[1] ? -units : units;
}
function fromUnits(units: bigint): string {
  const negative = units < ZERO;
  const abs = negative ? -units : units;
  return `${negative ? "-" : ""}${abs / SCALE}.${(abs % SCALE).toString().padStart(4, "0")}`;
}

/** Sum of 4-decimal money strings, exact: `sumMoney(["1.1000", "2.2000"])` → "3.3000". */
export function sumMoney(amounts: string[]): string {
  return fromUnits(amounts.reduce((total, a) => total + toUnits(a), ZERO));
}

/** a − b on money strings, exact. */
export function subtractMoney(a: string, b: string): string {
  return fromUnits(toUnits(a) - toUnits(b));
}

/** Compares two money strings: −1, 0 or 1. */
export function compareMoney(a: string, b: string): -1 | 0 | 1 {
  const d = toUnits(a) - toUnits(b);
  return d < ZERO ? -1 : d > ZERO ? 1 : 0;
}

// ── IMEI helpers (the API checks too; these only give early feedback).
/**
 * Removes spaces and dashes, as the API does, and turns Arabic-Indic (U+0660 to U+0669) and Persian (U+06F0 to U+06F9)
 * digits into 0-9: an Arabic keyboard types those, and the API only takes Latin digits (group C, decision 039).
 */
export function normalizeImei(value: string): string {
  return latinDigits(value.replace(/[\s-]/g, ""));
}

/**
 * Turns Arabic-Indic (U+0660 to U+0669) and Persian (U+06F0 to U+06F9) digits into 0-9 and leaves everything else as it is: the API
 * only takes Latin digits, and the checked field types (an IMEI, an IMEISV, an ICCID, a list of IMEIs, ...) are read after this.
 */
export function latinDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10));
}

/**
 * What is wrong with a typed IMEI, by the checks a form can make before it sends anything: `"length"` (not 15 digits once
 * spaces and dashes are removed) or `"checksum"` (15 digits whose last digit does not match the rest); null for a good one.
 * The check of a field of type `imei` in the shop's drawer (the merchant form uses `isValidImei`; decision 008).
 */
export function imeiProblem(value: string): "length" | "checksum" | null {
  if (!/^\d{15}$/.test(normalizeImei(value))) return "length";
  return isValidImei(value) ? null : "checksum";
}

/** An IMEI with all but its last four digits hidden ("•••••••••••7518"): what a summary line shows of a typed IMEI. */
export function maskImei(value: string): string {
  const digits = normalizeImei(value);
  return digits.length > 4 ? `${"•".repeat(digits.length - 4)}${digits.slice(-4)}` : digits;
}

/** 15 digits with a valid Luhn check digit. */
export function isValidImei(value: string): boolean {
  const digits = normalizeImei(value);
  if (!/^\d{15}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = digits.charCodeAt(i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
