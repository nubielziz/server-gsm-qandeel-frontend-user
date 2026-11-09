// Exact arithmetic on 4-decimal money strings for the indicative price (BigInt of ten-thousandths; never floats).
// Safe to import anywhere.

const SCALE = BigInt(10000);

/** `multiplyMoney("3.9900", 3)` → "11.9700". Quantity is a positive integer. */
export function multiplyMoney(amount: string, quantity: number): string {
  const m = /^(-)?(\d+)(?:\.(\d{1,4}))?$/.exec(amount.trim());
  if (!m) return amount;
  const units = BigInt(m[2]) * SCALE + BigInt((m[3] ?? "").padEnd(4, "0") || "0");
  const total = units * BigInt(Math.max(1, Math.floor(quantity)));
  const text = `${total / SCALE}.${(total % SCALE).toString().padStart(4, "0")}`;
  return m[1] ? `-${text}` : text;
}

/** True when a 4-decimal amount is greater than zero. */
export function isPositiveMoney(amount: string): boolean {
  return /[1-9]/.test(amount.replace(/\./, ""));
}
