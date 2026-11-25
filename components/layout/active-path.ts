// Matching the current URL against a nav link. Plain module: usable from Server and Client Components.

/** True when `pathname` is `href` or below it (`match="prefix"`), or exactly `href` (`match="exact"`). Ignores `?query` and `#hash`. */
export function isActivePath(pathname: string | null, href: string, match: "exact" | "prefix" = "prefix"): boolean {
  if (!pathname) return false;
  const path = href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const current = pathname.replace(/\/+$/, "") || "/";
  return current === path || (match === "prefix" && current.startsWith(`${path}/`));
}

/** The link is the current one only for this value of a query parameter: `{ name: "type", is: "imei" }`. Serializable. */
export type ParamIs = { name: string; is: string };

/** The link gives way to a more specific one when the parameter has one of these values: `{ name: "type", oneOf: ["imei", "server"] }`. Serializable. */
export type ParamOneOf = { name: string; oneOf: readonly string[] };

/**
 * A rule on one query parameter, declared as data so it can cross from a Server Component to a Client Component (no
 * functions). A link carries at most one of the two (`param` wins when both are given).
 */
export type ActiveRule = {
  /** The link is current only when the path is exactly the link's page and the parameter has exactly this one value. */
  param?: ParamIs;
  /**
   * The link is current as `match` says, except on the link's own page (exactly) when the parameter has exactly one
   * value and it is one of these: a sibling link carrying `param` is the current one then.
   */
  exceptParam?: ParamOneOf;
};

/** What the rule reads of the URL's query: a `URLSearchParams` (`useSearchParams()`) or anything with `getAll`. */
export type QueryParams = Pick<URLSearchParams, "getAll">;

/** The value of `name` when the query has exactly one, else null (absent, or repeated: `?type=a&type=b` has none). */
function onlyValue(searchParams: QueryParams | null, name: string): string | null {
  const values = searchParams?.getAll(name) ?? [];
  return values.length === 1 ? values[0] : null;
}

/**
 * Whether a nav link is the current one, from the pathname and the query. Without a rule it is `isActivePath`.
 * Why: "All services" and the four service-type links ("IMEI services", ...) share one path (the catalog), so the path
 * alone would mark all five; exactly one of them may be current:
 * - `param`: current only on the link's page itself (never below it: a service page is not "IMEI services") with
 *   exactly one value of the parameter, equal to `is`.
 * - `exceptParam`: current as `match` says, but not on the link's page itself when the parameter has exactly one value
 *   and it is listed (the type link has it). Two types chosen, none, or a value no link carries leave this link current.
 * @param searchParams The URL's query (null when it is not known: no parameters).
 */
export function isActiveLink(
  pathname: string | null,
  searchParams: QueryParams | null,
  href: string,
  match: "exact" | "prefix" = "prefix",
  rule: ActiveRule = {},
): boolean {
  const { param, exceptParam } = rule;
  if (param) return isActivePath(pathname, href, "exact") && onlyValue(searchParams, param.name) === param.is;
  if (!isActivePath(pathname, href, match)) return false;
  if (exceptParam && isActivePath(pathname, href, "exact")) {
    const value = onlyValue(searchParams, exceptParam.name);
    if (value !== null && exceptParam.oneOf.includes(value)) return false;
  }
  return true;
}
