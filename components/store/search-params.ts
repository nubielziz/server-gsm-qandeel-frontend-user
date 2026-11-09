// Small helpers for reading `searchParams` of store pages. Safe to import anywhere.
export type SearchParams = Record<string, string | string[] | undefined>;

/** The first value of a query parameter, trimmed and capped (empty string when absent). */
export function firstParam(value: string | string[] | undefined, max = 100): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim().slice(0, max);
}

/** The same record without the given keys (to build "remove this filter" links). */
export function withoutParams(params: SearchParams, ...keys: string[]): SearchParams {
  const copy: SearchParams = { ...params };
  for (const key of keys) delete copy[key];
  return copy;
}
