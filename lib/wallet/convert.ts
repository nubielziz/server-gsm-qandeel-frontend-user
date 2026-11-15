// Approximate amounts for the customer wallet (plan D6, BH §3.1): the wallet is always USD, so a visitor who shops in
// another currency sees "about {amount}" next to it, worked out with the rate of `GET /store/v1/config` currencies
// (`fxRate` = units of that currency per 1 USD). BigInt only, no floats; every amount in or out is a decimal string.
// Safe to import anywhere.
//
// Target is ES2017, so BigInt literals (`10n`) are not available: constants come from `BigInt(...)`.
import type { StoreCurrency } from "@/lib/api/types";

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);
/** Money has 4 decimals (the API's wire format). */
const SCALE = 4;

function pow10(n: number): bigint {
  let out = ONE;
  for (let i = 0; i < n; i++) out *= TEN;
  return out;
}

/** "-12.5000" → { negative, units: 125000, scale: 4 }. Null for anything but plain digits with an optional sign and fraction. */
function parse(text: string, signed: boolean): { negative: boolean; units: bigint; scale: number } | null {
  const m = (signed ? /^(-)?(\d+)(?:\.(\d+))?$/ : /^()(\d+)(?:\.(\d+))?$/).exec(text.trim());
  if (!m) return null;
  const fraction = m[3] ?? "";
  return { negative: m[1] === "-", units: BigInt(m[2] + fraction), scale: fraction.length };
}

/**
 * `usd × fxRate` as a 4-decimal money string, rounded half up (half away from zero for a negative amount) at the fourth
 * decimal: `convertMoney("50.0000", "0.70900000")` → "35.4500"; `convertMoney("0.0001", "0.50000000")` → "0.0001".
 * `usd` may be negative (a balance after a reversed payment); `fxRate` is a positive decimal.
 * Throws for a malformed amount or rate, so a bad rate can never print a wrong number.
 */
export function convertMoney(usd: string, fxRate: string): string {
  const amount = parse(usd, true);
  const rate = parse(fxRate, false);
  if (!amount) throw new Error(`Not an amount: ${usd}`);
  if (!rate || rate.units === ZERO) throw new Error(`Not a rate: ${fxRate}`);

  // amount × rate = (a.units × r.units) / 10^(a.scale + r.scale); in ten-thousandths: divide by 10^(a.scale + r.scale - 4).
  const product = amount.units * rate.units;
  const drop = amount.scale + rate.scale - SCALE;
  let units: bigint;
  if (drop <= 0) {
    units = product * pow10(-drop);
  } else {
    const divisor = pow10(drop);
    const quotient = product / divisor;
    units = (product % divisor) * TWO >= divisor ? quotient + ONE : quotient;
  }
  const abs = `${units / pow10(SCALE)}.${(units % pow10(SCALE)).toString().padStart(SCALE, "0")}`;
  return amount.negative && units !== ZERO ? `-${abs}` : abs;
}

/** What the page shows next to a USD amount: the converted amount and how to format it. */
export type Approximation = { amount: string; currency: string; decimals: number };

/**
 * The USD amount in the visitor's shop currency, or null when no approximation applies: the currency is USD itself, or
 * its rate is missing or unreadable (then nothing is shown rather than a wrong number).
 */
export function approximateIn(usd: string, currency: Pick<StoreCurrency, "code" | "decimals" | "fxRate">): Approximation | null {
  if (currency.code === "USD") return null;
  try {
    return { amount: convertMoney(usd, currency.fxRate), currency: currency.code, decimals: currency.decimals };
  } catch {
    return null;
  }
}
