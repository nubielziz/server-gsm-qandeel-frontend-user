// Query strings in the API's list dialect (handoff §3.11): `_start`/`_end` (0-based, end exclusive), `_sort`/`_order`
// (comma lists), `q`, and filters `field=value` (a repeated key = IN; suffixes `_ne`, `_gte`, `_lte` …).
// List routes answer 422 to ANY unknown parameter: never add cache-busters or empty values. Safe to import anywhere.

export type QueryValue = string | number | boolean | null | undefined;
export type QueryInput = Record<string, QueryValue | QueryValue[]>;

export type ListParams = {
  /** First row, 0-based (inclusive). */
  start?: number;
  /** Row after the last one (exclusive). Defaults to start + 25 on the server. */
  end?: number;
  sort?: string | string[];
  order?: "asc" | "desc" | ("asc" | "desc")[];
  q?: string;
};

/** `?a=1&b=x&b=y` from a record; undefined, null and '' are left out, arrays repeat the key. */
export function toQueryString(query?: QueryInput): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v === undefined || v === null || v === "") continue;
      params.append(name, String(v));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** List paging/sort/search plus route filters → one query record. */
export function listQuery(list: ListParams = {}, filters: QueryInput = {}): QueryInput {
  const sort = Array.isArray(list.sort) ? list.sort.join(",") : list.sort;
  const order = Array.isArray(list.order) ? list.order.join(",") : list.order;
  return {
    _start: list.start,
    _end: list.end,
    _sort: sort,
    _order: sort ? order : undefined,
    q: list.q?.trim() || undefined,
    ...filters,
  };
}

/** Page number (1-based) and page size → `_start`/`_end`. */
export function pageRange(page: number, perPage: number): { start: number; end: number } {
  const p = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  return { start: (p - 1) * perPage, end: p * perPage };
}

/** Reads a positive page number from a search param value ('3' → 3; anything else → 1). */
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** Fills `:name` placeholders of a route path: `pathOf('/client/orders/:id', { id: 7 })`. Values are encoded. */
export function pathOf(template: string, params: Record<string, string | number>): string {
  return template.replace(/:([A-Za-z_]\w*)/g, (_m, name: string) => {
    const value = params[name];
    if (value === undefined || value === null || value === "") throw new Error(`pathOf: missing "${name}" for ${template}`);
    return encodeURIComponent(String(value));
  });
}
