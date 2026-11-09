// Matching the current pathname against a nav link. Plain module: usable from Server and Client Components.

/** True when `pathname` is `href` or below it (`match="prefix"`), or exactly `href` (`match="exact"`). Ignores `?query` and `#hash`. */
export function isActivePath(pathname: string | null, href: string, match: "exact" | "prefix" = "prefix"): boolean {
  if (!pathname) return false;
  const path = href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const current = pathname.replace(/\/+$/, "") || "/";
  return current === path || (match === "prefix" && current.startsWith(`${path}/`));
}
