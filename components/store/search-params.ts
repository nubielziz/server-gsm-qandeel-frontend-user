// Small helpers for reading `searchParams` of store pages. Safe to import anywhere.
export type SearchParams = Record<string, string | string[] | undefined>;

/** The first value of a query parameter, trimmed and capped (empty string when absent). */
export function firstParam(value: string | string[] | undefined, max = 100): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim().slice(0, max);
}

/** Every value of a repeatable query parameter (`brand=A&brand=B`): trimmed, capped, without empties or repeats. */
export function allParams(value: string | string[] | undefined, max = 100, limit = 30): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const text = raw.trim().slice(0, max);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

/** A whole number from a query parameter (`"25"` → 25); null when absent or not a plain non-negative integer. */
export function intParam(value: string | string[] | undefined): number | null {
  const raw = firstParam(value, 12);
  return /^\d+$/.test(raw) ? Number(raw) : null;
}
