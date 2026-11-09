// NavLink: a navigation link that marks the current page (`aria-current="page"`, styled by the caller with
// `aria-[current=page]:` classes). Reading the pathname can suspend on routes with dynamic params, so the active
// version sits in <Suspense> and the fallback is the same link without the active mark: nothing shifts.
import Link from "next/link";
import { Suspense, type ComponentProps } from "react";
import { ActiveLink } from "./nav-link-client";

export type NavLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  /** Language-prefixed path. */
  href: string;
  /** `prefix` (default) is active for the page and everything below it; `exact` only for the page itself. */
  match?: "exact" | "prefix";
};

/** A link that knows if it is the current page. */
export function NavLink({ href, match, ...props }: NavLinkProps) {
  return (
    <Suspense fallback={<Link href={href} {...props} />}>
      <ActiveLink href={href} match={match} {...props} />
    </Suspense>
  );
}
