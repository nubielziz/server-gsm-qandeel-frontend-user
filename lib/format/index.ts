// Display formatting for both languages. Money arrives as a 4-decimal string ("12.4900"): it is formatted from the
// string (Intl accepts exact decimal strings) and summed with integer math, never as floats. Safe to import anywhere.
import { intlLocaleOf, type Locale } from "@/lib/i18n/config";

type Num = number | `${number}` | string;

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
function nf(locale: Locale, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const id = `n|${locale}|${JSON.stringify(options)}`;
  let f = cache.get(id) as Intl.NumberFormat | undefined;
  if (!f) cache.set(id, (f = new Intl.NumberFormat(intlLocaleOf(locale), options)));
  return f;
}
function df(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const id = `d|${locale}|${JSON.stringify(options)}`;
  let f = cache.get(id) as Intl.DateTimeFormat | undefined;
  if (!f) cache.set(id, (f = new Intl.DateTimeFormat(intlLocaleOf(locale), options)));
  return f;
}

/**
 * `formatMoney("12.4900", "USD", "en")` → "$12.49". `decimals` comes from `/store/v1/config` currencies (0–4);
 * without it the currency's usual digits are used. Rounds half away from zero.
 */
export function formatMoney(amount: string, currency: string, locale: Locale, decimals?: number): string {
  const options: Intl.NumberFormatOptions = { style: "currency", currency, currencyDisplay: "narrowSymbol" };
  if (decimals !== undefined) {
    options.minimumFractionDigits = decimals;
    options.maximumFractionDigits = decimals;
  }
  try {
    return nf(locale, options).format(amount as Intl.StringNumericLiteral);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function formatNumber(value: Num, locale: Locale, options: Intl.NumberFormatOptions = {}): string {
  return nf(locale, options).format(value as Intl.StringNumericLiteral);
}

/** "15.0000" (a percent as a decimal string) → "15%". */
export function formatPercent(percent: string, locale: Locale, maxDigits = 2): string {
  return `${nf(locale, { maximumFractionDigits: maxDigits }).format(percent as Intl.StringNumericLiteral)}%`;
}

export function formatDate(iso: string, locale: Locale, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : df(locale, options).format(d);
}

export function formatDateTime(iso: string, locale: Locale): string {
  return formatDate(iso, locale, { dateStyle: "medium", timeStyle: "short" });
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
/** Removes spaces and dashes, as the API does. */
export function normalizeImei(value: string): string {
  return value.replace(/[\s-]/g, "");
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
