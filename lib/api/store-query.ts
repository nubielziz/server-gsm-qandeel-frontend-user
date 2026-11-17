// The query of `GET /store/v1/services` (the store catalog list) built from the site's own arguments (plan D12).
// Pure: no I/O, safe to import anywhere. The route answers 422 to ANY unknown parameter and to a malformed value, so
// nothing empty is ever sent: an empty string, an empty array or an `undefined` leaves the key out. An array repeats
// the key (the API reads a repeated key as IN).
import { listQuery, type QueryInput } from "./query";
import type { ServiceAvailability, ServiceType } from "./types";

/** Sorts the route accepts (`_sort`): `featured`, `sort`, `title`, `popular` (best sellers), `listedAt` (new arrivals), `price`. */
export type ServiceSort = "featured" | "sort" | "title" | "popular" | "listedAt" | "price";

export type ServiceListArgs = {
  /** ISO code of the currency to price in (one `GET /store/v1/config` lists). */
  currency: string;
  q?: string;
  brand?: string | string[];
  network?: string | string[];
  country?: string | string[];
  featured?: boolean;
  /** Service types to keep (OR). */
  type?: ServiceType[];
  /** Numeric category ids (OR): the number before the first `-` of a category slug. */
  categoryId?: number[];
  availability?: ServiceAvailability | ServiceAvailability[];
  /** Lowest `price.gross` (inclusive), a decimal string in `currency`. */
  minPrice?: string;
  /** Highest `price.gross` (inclusive), a decimal string in `currency`; the API refuses a value below `minPrice`. */
  maxPrice?: string;
  /** No sort sends no `_sort`: the API's own order (featured first, then `sort`, then title). */
  sort?: ServiceSort;
  /** Defaults per sort: `desc` for `featured`, `popular` and `listedAt`; `asc` for the rest. */
  order?: "asc" | "desc";
  /** First row, 0-based. Default 0. */
  start?: number;
  /** Row after the last one. Default `start + 24`; kept above `start`, and capped at `start + 100` (a page holds at most 100 rows). */
  end?: number;
  buyerCountry?: string;
};

const DESC_FIRST: ReadonlySet<ServiceSort> = new Set(["featured", "popular", "listedAt"]);

/** Rows per page the route allows. */
export const MAX_PAGE_SIZE = 100;

/**
 * A paging window the list routes accept: `start` a whole number from 0, `end` above `start` and at most `start + 100`
 * (the API answers 422 to anything else, and a cached read that throws errors the whole page). A missing or non-finite
 * value falls back to `start = 0` and `end = start + defaultSize`.
 */
export function pageWindow(args: { start?: number; end?: number }, defaultSize: number): { start: number; end: number } {
  const start = Number.isFinite(args.start) ? Math.max(0, Math.floor(args.start as number)) : 0;
  const want = Number.isFinite(args.end) ? Math.floor(args.end as number) : start + defaultSize;
  return { start, end: Math.min(Math.max(want, start + 1), start + MAX_PAGE_SIZE) };
}

/** The direction a sort takes when the caller names none. */
export function defaultOrder(sort: ServiceSort): "asc" | "desc" {
  return DESC_FIRST.has(sort) ? "desc" : "asc";
}

/** One value or a list → the non-empty trimmed strings, or `undefined` when none is left (the key is then left out). */
function strings(value: string | readonly string[] | undefined): string[] | undefined {
  const list = (Array.isArray(value) ? value : [value]).flatMap((v) => {
    const text = typeof v === "string" ? v.trim() : "";
    return text ? [text] : [];
  });
  return list.length > 0 ? list : undefined;
}

/** Category ids must be numeric (the API answers 422 to anything else): keep positive integers only. */
function ids(value: readonly number[] | undefined): string[] | undefined {
  const list = (value ?? []).filter((n) => Number.isSafeInteger(n) && n > 0).map(String);
  return list.length > 0 ? list : undefined;
}

/** The query record for one catalog page. Hand it to `apiPublicList('/store/v1/services', { query })`. */
export function storeServicesQuery(args: ServiceListArgs): QueryInput {
  const { start, end } = pageWindow(args, 24);
  // No `locale`: the site is English only (decision 039) and the route answers 422 to a key it does not know.
  const filters: QueryInput = { currency: args.currency };
  const add = (key: string, value: string | string[] | boolean | undefined) => {
    if (value !== undefined) filters[key] = value;
  };
  add("type", strings(args.type));
  add("categoryId", ids(args.categoryId));
  add("brand", strings(args.brand));
  add("network", strings(args.network));
  add("country", strings(args.country));
  add("availability", strings(args.availability));
  add("featured", args.featured);
  add("minPrice", strings(args.minPrice)?.[0]);
  add("maxPrice", strings(args.maxPrice)?.[0]);
  add("buyerCountry", strings(args.buyerCountry)?.[0]);
  const query = listQuery(
    {
      start,
      end,
      q: args.q,
      sort: args.sort,
      order: args.sort ? (args.order ?? defaultOrder(args.sort)) : undefined,
    },
    filters,
  );
  // `listQuery` keeps keys whose value is undefined: drop them, so the record holds only what is sent.
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined));
}

// ── `GET /store/v1/search` (backend plan 29 §5.3): the English results page. Its own query dialect: `page` and
// `perPage` (not `_start`/`_end`), `sort` and `order` (not `_sort`/`_order`). The same
// 422 rule: nothing empty is sent.

/** Sorts of the results page: `relevance` (the default, sent as nothing), best sellers, name, new arrivals, price. */
export type SearchSort = "relevance" | "popular" | "title" | "listedAt" | "price";

/** The highest page and the largest page the route accepts. */
export const SEARCH_MAX_PAGE = 50;
export const SEARCH_MAX_PER_PAGE = 48;
/** The longest query the route accepts (characters, after its own normalising). */
export const SEARCH_MAX_QUERY = 100;

export type StoreSearchArgs = {
  /** The visitor's text (1-100 characters; longer text is cut). */
  q: string;
  /** ISO code of the currency to price the cards in. */
  currency: string;
  /** 1-based, at most 50. */
  page?: number;
  /** 1-48, default 24. */
  perPage?: number;
  brand?: string | string[];
  network?: string | string[];
  country?: string | string[];
  categoryId?: number[];
  type?: ServiceType[];
  availability?: ServiceAvailability;
  featured?: boolean;
  /** Left out (or `relevance`): best match first. */
  sort?: SearchSort;
  /** Only for `title`, `listedAt` and `price` (the route ignores it for the others, so it is not sent). */
  order?: "asc" | "desc";
  minPrice?: string;
  maxPrice?: string;
  buyerCountry?: string;
};

const ORDERED: ReadonlySet<SearchSort> = new Set(["title", "listedAt", "price"]);

/** A whole number held inside [min, max]; anything else is `fallback`. */
function within(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), min), max);
}

/** The query record of one results page. Hand it to `apiVisitorGet('/store/v1/search', { query })`. */
export function storeSearchQuery(args: StoreSearchArgs): QueryInput {
  const query: QueryInput = { q: args.q.trim().slice(0, SEARCH_MAX_QUERY), currency: args.currency };
  const add = (key: string, value: string | string[] | undefined) => {
    if (value !== undefined) query[key] = value;
  };
  const page = within(args.page, 1, SEARCH_MAX_PAGE, 1);
  if (page > 1) query.page = page;
  query.perPage = within(args.perPage, 1, SEARCH_MAX_PER_PAGE, 24);
  add("brand", strings(args.brand));
  add("network", strings(args.network));
  add("country", strings(args.country));
  add("categoryId", ids(args.categoryId));
  add("type", strings(args.type));
  add("availability", strings(args.availability)?.[0]);
  if (args.featured !== undefined) query.featured = args.featured;
  if (args.sort && args.sort !== "relevance") {
    query.sort = args.sort;
    if (ORDERED.has(args.sort)) query.order = args.order ?? (args.sort === "listedAt" ? "desc" : "asc");
  }
  add("minPrice", strings(args.minPrice)?.[0]);
  add("maxPrice", strings(args.maxPrice)?.[0]);
  add("buyerCountry", strings(args.buyerCountry)?.[0]);
  return query;
}
