// Filters of the merchant lists (services, orders, invoices): read from the page's search params, validated against
// what the API accepts, and turned into the API's list query (handoff §3.11). List routes answer 422 to any
// parameter they do not declare, so only declared, non-empty values are ever sent.
import { listQuery, pageRange, parsePage, type QueryInput } from "@/lib/api/query";

export const SERVICES_PER_PAGE = 50;
export const ORDERS_PER_PAGE = 25;
export const STATEMENT_PER_PAGE = 25;
export const INVOICES_PER_PAGE = 20;

export type SearchParams = Record<string, string | string[] | undefined>;

/** The first value of a search param, trimmed ('' when absent). */
export function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | "" {
  return (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

/** `2026-11-09` → true only for a real calendar date. */
export function isDateOnly(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** Start of the day in UTC, in the API's date-time shape (the API reads dates as UTC). */
export function dayStartIso(date: string): string {
  return `${date}T00:00:00.000Z`;
}

/** End of the day in UTC. */
export function dayEndIso(date: string): string {
  return `${date}T23:59:59.999Z`;
}

// ── Services ───────────────────────────────────────────────────────────────────────────────────────────────

export const SERVICE_TYPES = ["imei", "server", "remote", "file"] as const;
export type ServiceTypeFilter = (typeof SERVICE_TYPES)[number];
export const SERVICE_SORTS = ["category", "name", "type"] as const;
export type ServiceSort = (typeof SERVICE_SORTS)[number];

export type ServicesFilters = {
  q: string;
  type: ServiceTypeFilter | "";
  categoryId: string;
  sort: ServiceSort;
  page: number;
};

export function parseServicesFilters(sp: SearchParams): ServicesFilters {
  const categoryId = first(sp.categoryId);
  return {
    q: first(sp.q),
    type: oneOf(first(sp.type), SERVICE_TYPES),
    categoryId: /^[1-9]\d{0,15}$/.test(categoryId) ? categoryId : "",
    sort: oneOf(first(sp.sort), SERVICE_SORTS) || "category",
    page: parsePage(sp.page),
  };
}

const SERVICE_SORT_PARAMS: Record<ServiceSort, { sort: string[]; order: ("asc" | "desc")[] }> = {
  category: { sort: ["category", "name"], order: ["asc", "asc"] },
  name: { sort: ["name"], order: ["asc"] },
  type: { sort: ["type", "name"], order: ["asc", "asc"] },
};

/** `GET /client/services` query for one page. */
export function servicesQuery(f: ServicesFilters): QueryInput {
  const { start, end } = pageRange(f.page, SERVICES_PER_PAGE);
  return listQuery({ start, end, ...SERVICE_SORT_PARAMS[f.sort], q: f.q }, {
    type: f.type || undefined,
    categoryId: f.categoryId || undefined,
  });
}

/** The query of `GET /client/prices/export` (only `type` and `categoryId` exist there). */
export function pricesExportQuery(f: Pick<ServicesFilters, "type" | "categoryId">): QueryInput {
  return { type: f.type || undefined, categoryId: f.categoryId || undefined };
}

// ── Orders ─────────────────────────────────────────────────────────────────────────────────────────────────

export const ORDER_STATUSES = ["pending", "processing", "completed", "rejected"] as const;
export type OrderStatusFilter = (typeof ORDER_STATUSES)[number];
export const ORDER_SORTS = ["newest", "oldest", "total_desc", "total_asc"] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];

export type OrdersFilters = {
  status: OrderStatusFilter | "";
  type: ServiceTypeFilter | "";
  q: string;
  /** `YYYY-MM-DD` or ''. */
  from: string;
  to: string;
  sort: OrderSort;
  page: number;
};

export function parseOrdersFilters(sp: SearchParams): OrdersFilters {
  const from = first(sp.from);
  const to = first(sp.to);
  return {
    status: oneOf(first(sp.status), ORDER_STATUSES),
    type: oneOf(first(sp.type), SERVICE_TYPES),
    q: first(sp.q),
    from: isDateOnly(from) ? from : "",
    to: isDateOnly(to) ? to : "",
    sort: oneOf(first(sp.sort), ORDER_SORTS) || "newest",
    page: parsePage(sp.page),
  };
}

const ORDER_SORT_PARAMS: Record<OrderSort, { sort: string; order: "asc" | "desc" }> = {
  newest: { sort: "createdAt", order: "desc" },
  oldest: { sort: "createdAt", order: "asc" },
  total_desc: { sort: "totalPrice", order: "desc" },
  total_asc: { sort: "totalPrice", order: "asc" },
};

/** `GET /client/orders` query for one page. */
export function ordersQuery(f: OrdersFilters): QueryInput {
  const { start, end } = pageRange(f.page, ORDERS_PER_PAGE);
  return listQuery({ start, end, ...ORDER_SORT_PARAMS[f.sort], q: f.q }, {
    status: f.status || undefined,
    type: f.type || undefined,
    createdAt_gte: f.from ? dayStartIso(f.from) : undefined,
    createdAt_lte: f.to ? dayEndIso(f.to) : undefined,
  });
}

/** `GET /client/orders/export` query: the same filters and sort, but the API ignores the date range there (handoff §4.6). */
export function ordersExportQuery(f: OrdersFilters): QueryInput {
  return listQuery({ ...ORDER_SORT_PARAMS[f.sort], q: f.q }, { status: f.status || undefined, type: f.type || undefined });
}

// ── Invoices ───────────────────────────────────────────────────────────────────────────────────────────────

export const INVOICE_STATUSES = ["open", "paid", "void"] as const;
export type InvoiceStatusFilter = (typeof INVOICE_STATUSES)[number];
export const INVOICE_KINDS = ["topup", "manual", "statement"] as const;
export type InvoiceKindFilter = (typeof INVOICE_KINDS)[number];
export const INVOICE_SORTS = ["newest", "oldest", "total_desc", "total_asc"] as const;
export type InvoiceSort = (typeof INVOICE_SORTS)[number];

export type InvoicesFilters = {
  status: InvoiceStatusFilter | "";
  kind: InvoiceKindFilter | "";
  q: string;
  sort: InvoiceSort;
  page: number;
  /** The invoice shown in the preview panel (`?selected=`), or ''. */
  selected: string;
};

export function parseInvoicesFilters(sp: SearchParams): InvoicesFilters {
  const selected = first(sp.selected);
  return {
    status: oneOf(first(sp.status), INVOICE_STATUSES),
    kind: oneOf(first(sp.kind), INVOICE_KINDS),
    q: first(sp.q),
    sort: oneOf(first(sp.sort), INVOICE_SORTS) || "newest",
    page: parsePage(sp.page),
    selected: /^[1-9]\d{0,15}$/.test(selected) ? selected : "",
  };
}

const INVOICE_SORT_PARAMS: Record<InvoiceSort, { sort: string; order: "asc" | "desc" }> = {
  newest: { sort: "createdAt", order: "desc" },
  oldest: { sort: "createdAt", order: "asc" },
  total_desc: { sort: "total", order: "desc" },
  total_asc: { sort: "total", order: "asc" },
};

export function invoicesQuery(f: InvoicesFilters): QueryInput {
  const { start, end } = pageRange(f.page, INVOICES_PER_PAGE);
  return listQuery({ start, end, ...INVOICE_SORT_PARAMS[f.sort], q: f.q }, { status: f.status || undefined, kind: f.kind || undefined });
}

/** A count-only request: one row, the total comes from `x-total-count`. */
export function countQuery(filters: QueryInput = {}): QueryInput {
  return listQuery({ start: 0, end: 1 }, filters);
}

/** `hrefWith("/en/merchant/orders", { status: "pending", q: "" })` → `/en/merchant/orders?status=pending` (empty values are left out). */
export function hrefWith(basePath: string, params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) sp.set(key, value);
  const text = sp.toString();
  return text ? `${basePath}?${text}` : basePath;
}
