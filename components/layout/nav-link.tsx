// NavLink: a navigation link that marks the current page (`aria-current="page"`, styled by the caller with
// `aria-[current=page]:` classes). Reading the pathname can suspend on routes with dynamic params, so the active
// version sits in <Suspense> and the fallback is the same link without the active mark: nothing shifts.
// A link that carries a rule on a query parameter (`param` / `exceptParam`, active-path.ts) also reads the query: it uses
// ActiveParamLink, still inside the same <Suspense> (reading the query needs the boundary on a static page). Links
// without a rule never touch the query.
import Link from "next/link";
import { Suspense, type ComponentProps } from "react";
import type { ActiveRule } from "./active-path";
import { ActiveLink, ActiveParamLink } from "./nav-link-client";

export type NavLinkProps = Omit<ComponentProps<typeof Link>, "href"> &
  ActiveRule & {
    /** Language-prefixed path. */
    href: string;
    /** `prefix` (default) is active for the page and everything below it; `exact` only for the page itself. */
    match?: "exact" | "prefix";
  };

/** A link that knows if it is the current page. */
export function NavLink({ href, match, param, exceptParam, ...props }: NavLinkProps) {
  return (
    <Suspense fallback={<Link href={href} {...props} />}>
      {param || exceptParam ? (
        <ActiveParamLink href={href} match={match} param={param} exceptParam={exceptParam} {...props} />
      ) : (
        <ActiveLink href={href} match={match} {...props} />
      )}
    </Suspense>
  );
}
