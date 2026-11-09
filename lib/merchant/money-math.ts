// Exact decimal math for the merchant portal: price × quantity and top-up fees. BigInt only, no floats.
// The API sends and accepts money as decimal strings with up to 4 places; everything here returns 4-place strings
// ("12.4900") that `formatMoney` and `sumMoney` (lib/format) take. Safe to import anywhere.
//
// Target is ES2017, so BigInt literals (`10n`) are not available: constants come from `BigInt(...)`.

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);
const SCALE = 4;

/** value = units / 10^scale */
type Decimal = { units: bigint; scale: number };

function pow10(n: number): bigint {
  let out = ONE;
  for (let i = 0; i < n; i++) out *= TEN;
  return out;
}

/** Parses "12", "12.5", "0.0500" (non-negative, plain digits). Returns null for anything else. */
function parseDecimal(text: string): Decimal | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) return null;
  const fraction = m[2] ?? "";
  return { units: BigInt(m[1] + fraction), scale: fraction.length };
}

/** Divides by 10^drop and rounds half up (away from zero for the non-negative values used here). */
function roundHalfUp(units: bigint, drop: number): bigint {
  if (drop <= 0) return units * pow10(-drop);
  const divisor = pow10(drop);
  const quotient = units / divisor;
  const remainder = units % divisor;
  return remainder * TWO >= divisor ? quotient + ONE : quotient;
}

/** Writes ten-thousandths as a 4-place string. */
function toMoney(units: bigint): string {
  const negative = units < ZERO;
  const abs = negative ? -units : units;
  const scale = pow10(SCALE);
  return `${negative ? "-" : ""}${abs / scale}.${(abs % scale).toString().padStart(SCALE, "0")}`;
}

/** A decimal as ten-thousandths, rounded half up. */
function toUnits(value: Decimal): bigint {
  return roundHalfUp(value.units, value.scale - SCALE);
}

/**
 * `unit × quantity` as a 4-place money string, exact: `mulMoney("0.1000", 3)` → "0.3000" (a float gives
 * 0.30000000000000004). `quantity` is a whole number ≥ 0. Throws for a malformed price.
 */
export function mulMoney(unitPrice: string, quantity: number): string {
  const unit = parseDecimal(unitPrice);
  if (!unit) throw new Error(`Not a price: ${unitPrice}`);
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error(`Not a quantity: ${quantity}`);
  return toMoney(toUnits({ units: unit.units * BigInt(quantity), scale: unit.scale }));
}

/** `amount × percent / 100`, rounded half up to 4 places: `percentOf("200.0000", "2.5")` → "5.0000". */
export function percentOf(amount: string, percent: string): string {
  const a = parseDecimal(amount);
  const p = parseDecimal(percent);
  if (!a || !p) throw new Error(`Not a decimal: ${amount} / ${percent}`);
  // amount × percent / 100 = (a.units × p.units) / 10^(a.scale + p.scale + 2)
  return toMoney(toUnits({ units: a.units * p.units, scale: a.scale + p.scale + 2 }));
}

/** The fee of a top-up: `amount × feePercent / 100 + feeFixed` (an estimate: the invoice shows the final fee). */
export function topUpFee(amount: string, feePercent: string, feeFixed: string): string {
  const fixed = parseDecimal(feeFixed);
  if (!fixed) throw new Error(`Not a decimal: ${feeFixed}`);
  const percentUnits = BigInt(percentOf(amount, feePercent).replace(".", ""));
  return toMoney(percentUnits + toUnits(fixed));
}

/**
 * Reads an amount a person typed: digits with an optional `.` (or the Arabic decimal mark) and at most
 * `maxDecimals` places (Arabic-Indic digits are accepted). A comma is refused on purpose: "1,000" could mean one
 * thousand or one. Returns the canonical 4-place string, or null when it is not a positive amount.
 */
export function parseAmountInput(text: string, maxDecimals = SCALE): string | null {
  const latin = text
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".");
  const m = /^(\d*)(?:\.(\d*))?$/.exec(latin);
  if (!m || (!m[1] && !m[2])) return null;
  const whole = m[1] || "0";
  const fraction = m[2] ?? "";
  if (fraction.length > maxDecimals) return null;
  const units = BigInt(whole + fraction.padEnd(SCALE, "0"));
  return units > ZERO ? toMoney(units) : null;
}

/** True when `price` has the shape the API sends for money (`12.4900`). */
export function isMoney(text: string): boolean {
  return /^-?\d+\.\d{4}$/.test(text);
}
