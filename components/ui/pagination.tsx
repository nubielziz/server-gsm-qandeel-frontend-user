// Pagination: link-based page navigation with the total. The page lives in the URL (`?page=3`), so it works without
// JavaScript and can be shared. Server component.
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { fmt, plural } from "@/lib/i18n/define";
import { common } from "@/lib/i18n/messages/common";
import { cn } from "@/lib/cn";

export type SearchParamsInput = Record<string, string | string[] | undefined>;

/** `pageHref("/en/account/orders", { status: "open" }, 3)` → `/en/account/orders?status=open&page=3` (page 1 drops the parameter). */
export function pageHref(basePath: string, searchParams: SearchParamsInput | undefined, page: number, pageParam = "page"): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (key === pageParam || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) query.append(key, v);
  }
  if (page > 1) query.set(pageParam, String(page));
  const qs = query.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** The page numbers to show (1-based, `null` = gap): first, last, and a window around the current one. */
function pageWindow(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const shown = new Set([1, 2, pages - 1, pages, page - 1, page, page + 1]);
  const list = [...shown].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  list.forEach((n, i) => {
    if (i > 0 && n - list[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

export type PaginationProps = {
  /** Total number of rows (from `x-total-count`). */
  total: number;
  /** Rows per page. */
  pageSize: number;
  /** Current page, 1-based (clamped to the valid range). */
  page: number;
  /** The current path, language-prefixed, without a query string. */
  basePath: string;
  /** The page's current search parameters; all are kept on every link except `pageParam`. */
  searchParams?: SearchParamsInput;
  /** Query parameter that holds the page (default `page`). */
  pageParam?: string;
  /** A fragment added to every link (`#all-services`): a list in the middle of a page brings its own top into view. */
  hash?: string;
  className?: string;
};

/** Page links look like ghost buttons and move like them (`btn-motion`: the background eases, a press scales, globals.css). */
const itemClasses = "btn-motion inline-flex size-11 items-center justify-center rounded-control text-body font-semibold num";

/** "{total} results", "Page X of Y" and previous / numbered / next links (phones show only previous / next). With one page only the total shows. */
export function Pagination({ total, pageSize, page, basePath, searchParams, pageParam = "page", hash = "", className }: PaginationProps) {
  const t = common;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const href = (n: number) => pageHref(basePath, searchParams, n, pageParam) + hash;
  const totalText = plural(total, t.pagination.results, formatNumber(total));

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-3", className)}>
      <p className="text-small text-ink-subtle">
        <span>{totalText}</span>
        {pages > 1 ? (
          <>
            <span aria-hidden="true"> · </span>
            <span>{fmt(t.pagination.page, { page: formatNumber(current), pages: formatNumber(pages) })}</span>
          </>
        ) : null}
      </p>
      {pages > 1 ? (
        <nav aria-label={t.pagination.label}>
          <ul className="flex items-center gap-1">
            <li>
              {current > 1 ? (
                <Link href={href(current - 1)} aria-label={t.pagination.previous} rel="prev" className={cn(itemClasses, "text-ink hover:bg-surface-sunken")}>
                  <ChevronLeft aria-hidden="true" className="size-5" />
                </Link>
              ) : (
                <span aria-disabled="true" className={cn(itemClasses, "text-ink-subtle opacity-50")}>
                  <ChevronLeft aria-hidden="true" className="size-5" />
                </span>
              )}
            </li>
            {pageWindow(current, pages).map((n, i) =>
              n === null ? (
                <li key={`gap-${i}`} aria-hidden="true" className="hidden px-1 text-ink-subtle sm:block">
                  …
                </li>
              ) : (
                <li key={n} className="hidden sm:block">
                  <Link
                    href={href(n)}
                    aria-label={fmt(t.pagination.goTo, { page: formatNumber(n) })}
                    aria-current={n === current ? "page" : undefined}
                    className={cn(itemClasses, n === current ? "bg-primary text-on-primary" : "text-ink hover:bg-surface-sunken")}
                  >
                    {formatNumber(n)}
                  </Link>
                </li>
              ),
            )}
            <li>
              {current < pages ? (
                <Link href={href(current + 1)} aria-label={t.pagination.next} rel="next" className={cn(itemClasses, "text-ink hover:bg-surface-sunken")}>
                  <ChevronRight aria-hidden="true" className="size-5" />
                </Link>
              ) : (
                <span aria-disabled="true" className={cn(itemClasses, "text-ink-subtle opacity-50")}>
                  <ChevronRight aria-hidden="true" className="size-5" />
                </span>
              )}
            </li>
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
