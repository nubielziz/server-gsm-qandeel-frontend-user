// Breadcrumbs: where the visitor is. The last item is the current page.
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { cn } from "@/lib/cn";

export type BreadcrumbItem = {
  label: string;
  /** Omit on the last item (the current page). */
  href?: string;
};

export type BreadcrumbsProps = {
  /** Accessible name of the navigation ("Breadcrumb"). */
  label: string;
  items: BreadcrumbItem[];
  className?: string;
};

/** A breadcrumb trail with chevrons that point the right way in Arabic. */
export function Breadcrumbs({ label, items, className }: BreadcrumbsProps) {
  return (
    <nav aria-label={label} className={className}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-small text-ink-subtle">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={`${item.label}-${i}`}>
              <li className="min-w-0">
                {item.href && !last ? (
                  <Link href={item.href} className="touch-target rounded-badge hover:text-ink hover:underline">
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className={cn(last && "font-semibold text-ink")}>
                    {item.label}
                  </span>
                )}
              </li>
              {last ? null : (
                <li aria-hidden="true" className="flex">
                  <ChevronRight className="size-3.5 rtl:-scale-x-100" />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
