"use client";
// The part of NavLink that needs the current pathname. Use NavLink (nav-link.tsx), which wraps this in <Suspense>.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { isActivePath } from "./active-path";

export type ActiveLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  match?: "exact" | "prefix";
};

/** A next/link that sets `aria-current="page"` when the current route is at or under `href`. */
export function ActiveLink({ href, match, ...props }: ActiveLinkProps) {
  const pathname = usePathname();
  return <Link href={href} aria-current={isActivePath(pathname, href, match) ? "page" : undefined} {...props} />;
}
