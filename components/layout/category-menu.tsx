// The category menu of the shop header (plan F31, BH §2.3): the API's categories, each with its `serviceCount`, linking to
// the catalog filtered by it (`/services?category=<slug>`, plan D12). Two views of one list: `CategoryMenu`, an "All
// categories" popover in the desktop nav row, and `CategoryDrawerList`, a `<details>` block in the mobile drawer.
// Server Components (the Menu they use is the only client part). The list comes from the cached read
// `listStoreCategories`, which holds only categories with at least one service; `loadMenuCategories` never throws, so
// a failing read leaves the header without a menu instead of breaking every page.
import Link from "next/link";
import { ChevronDown, Tags } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui/menu";
import { listStoreCategories } from "@/lib/api/public";
import type { StoreCategory } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { sitePath } from "@/lib/site-path";

/** Width in px of the desktop panel: room for a long category name, its count and the padding. */
const PANEL_WIDTH = 288;

/** The rows of the drawer list: a 44 px target (48 px is the drawer's own row) in the drawer's type scale. */
const drawerItemClasses =
  "flex min-h-11 items-center gap-3 rounded-control px-3 text-body font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink";

/**
 * The categories the menu lists: the cached read, without any category that has no service (the API leaves those out
 * already). `[]` when the read fails (503, network): the header must never break the page.
 */
export async function loadMenuCategories(): Promise<StoreCategory[]> {
  try {
    const categories = await listStoreCategories();
    return categories.filter((category) => category.serviceCount > 0 && category.slug !== "" && category.name !== "");
  } catch {
    return [];
  }
}

/** The catalog filtered by one category: `/en/services?category=4-carrier-unlock`. */
export function categoryHref(category: Pick<StoreCategory, "slug">): string {
  return `${sitePath("/services")}?category=${encodeURIComponent(category.slug)}`;
}

/**
 * One row: the category name (isolated from the page's direction, since the names are the shop's own words) and its
 * service count in brackets, the same way the catalog sidebar writes it ("Apple (2)").
 */
function CategoryRow({ category }: { category: StoreCategory }) {
  return (
    <>
      <span className="min-w-0 flex-1 truncate">
        <bdi>{category.name}</bdi>
      </span>
      <span className="num shrink-0 text-small font-normal text-ink-subtle">({formatNumber(category.serviceCount)})</span>
    </>
  );
}

export type CategoryMenuProps = {
  categories: StoreCategory[];
  /** The trigger's text and accessible name ("All categories"). */
  label: string;
  /** The name of the list inside the panel ("Categories"). */
  listLabel: string;
  /** The look of the trigger: the nav row's link classes, so the button sits among the links. */
  triggerClassName: string;
};

/**
 * Desktop: the "All categories" button of the nav row. It opens a panel (native popover: Esc and a click outside close
 * it, Up and Down move between the rows) with one link per category. Nothing when there are no categories.
 *
 * @example <CategoryMenu categories={await loadMenuCategories()} label="All categories" listLabel="Categories" triggerClassName={…} />
 */
export function CategoryMenu({ categories, label, listLabel, triggerClassName }: CategoryMenuProps) {
  if (categories.length === 0) return null;
  return (
    <Menu label={label} trigger={label} chevron align="start" width={PANEL_WIDTH} triggerClassName={cn(triggerClassName, "cursor-pointer aria-expanded:bg-surface-muted aria-expanded:text-ink")}>
      <nav aria-label={listLabel}>
        <ul>
          {categories.map((category) => (
            <li key={category.id}>
              <MenuItem href={categoryHref(category)}>
                <CategoryRow category={category} />
              </MenuItem>
            </li>
          ))}
        </ul>
      </nav>
    </Menu>
  );
}

export type CategoryDrawerListProps = {
  categories: StoreCategory[];
  /** The summary's text ("Categories"). */
  label: string;
  /** The look of the summary row: the drawer's link classes, so it sits among the links. */
  summaryClassName: string;
};

/**
 * Mobile drawer: a `<details>` block under "All services" that lists the same categories. Plain HTML (no script): the
 * summary opens and closes it from the keyboard; a click on a link goes to the page and the drawer closes itself.
 * Nothing when there are no categories.
 */
export function CategoryDrawerList({ categories, label, summaryClassName }: CategoryDrawerListProps) {
  if (categories.length === 0) return null;
  return (
    <details className="group/categories">
      <summary className={cn("cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden", summaryClassName)}>
        <Tags aria-hidden="true" />
        <span className="min-w-0 flex-1 text-start">{label}</span>
        <ChevronDown aria-hidden="true" className="transition-transform group-open/categories:rotate-180" />
      </summary>
      <ul className="mb-1 ms-6 mt-1 grid gap-0.5 border-s border-line ps-2">
        {categories.map((category) => (
          <li key={category.id}>
            <Link href={categoryHref(category)} className={drawerItemClasses}>
              <CategoryRow category={category} />
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
