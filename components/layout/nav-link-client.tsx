"use client";
// The parts of NavLink that need the current URL. Use NavLink (nav-link.tsx), which wraps them in <Suspense>.
// ActiveLink reads the pathname only; ActiveParamLink also reads the query and is for the links that carry a rule on a
// parameter (hooks cannot be conditional, and a link without a rule must not depend on the query).
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import { isActiveLink, isActivePath, type ActiveRule } from "./active-path";

export type ActiveLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  match?: "exact" | "prefix";
};

/** A next/link that sets `aria-current="page"` when the current route is at or under `href`. */
export function ActiveLink({ href, match, ...props }: ActiveLinkProps) {
  const pathname = usePathname();
  return <Link href={href} aria-current={isActivePath(pathname, href, match) ? "page" : undefined} {...props} />;
}

export type ActiveParamLinkProps = ActiveLinkProps & ActiveRule;

/**
 * An ActiveLink whose mark also depends on one query parameter (`param` / `exceptParam`, see `isActiveLink`): the
 * "IMEI services" link is current on `/services?type=imei` only, and "All services" is not then.
 */
export function ActiveParamLink({ href, match, param, exceptParam, ...props }: ActiveParamLinkProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = isActiveLink(pathname, searchParams, href, match, { param, exceptParam });
  return <Link href={href} aria-current={active ? "page" : undefined} {...props} />;
}
