// StoreHeader (mockup "E-Commerce"): logo, search, currency, account area, then a nav row ("All services",
// the "All categories" menu and the other links) whose black pill marks the current page's link and slides to the next
// one (components/layout/nav-row.tsx); on pages without a current link (the home page) it rests on "All services".
// There is no cart, no favourites, no bell and no social sign-in (the API has none).
// Mobile: a compact bar (logo, search toggle, account, menu button) and a start-side drawer with the nav, the same
// categories in a `<details>` block, and the currency picker.
// Static shell: only the account area and the currency picker read request data, each inside its own <Suspense>. The
// categories are a cached catalog read (components/layout/category-menu.tsx): a change shows when the cache turns over.
// The two "All services" links use `prefetch={true}`: their prefetch carries the catalog's first page (cached, URL data),
// so the list shows at once on the click (plan P3.1, Next docs "Optimizing prefetching"). The nav row is hidden below `lg`
// and the drawer link is not in the viewport while the drawer is closed, so each costs a server render only when seen.
// Search (feature 29, backend plan §7): each copy of the search form (desktop bar, phone row) is wrapped in a
// SearchEnhancer, which turns it into the search combobox on the first interaction (without JavaScript it stays a plain
// GET form). The phone copy carries `autofocus`, so the row's popover focuses it inside
// the tap (a phone then opens its keyboard).
import { Headset, LayoutGrid, Store, PackageSearch, LifeBuoy } from "lucide-react";
import { sitePath } from "@/lib/site-path";
import { common } from "@/lib/i18n/messages/common";
import { search as searchMessages } from "@/lib/i18n/messages/search";
import { SearchInput } from "@/components/ui/search-input";
import { SearchEnhancer } from "@/components/search/search-enhancer";
import type { SearchComboboxLabels } from "@/components/search/search-combobox";
import { AccountArea } from "./account-area";
import { CategoryDrawerList, CategoryMenu, loadMenuCategories } from "./category-menu";
import { CurrencySwitcherSlot } from "./currency-switcher-slot";
import { Logo } from "./logo";
import { NavLink } from "./nav-link";
import { StoreHeaderFrame } from "./store-header-frame";

// The nav row's items. Colours, hover and the selected look are `.nav-item` in globals.css (they depend on the pill's
// state); one weight for every link, so selecting one never changes the row's widths. 40 px high like the old pill,
// with a 44 px touch target.
const navLinkClasses =
  "nav-item touch-target relative inline-flex h-10 items-center gap-2 rounded-full px-3 text-body font-medium " +
  "[&_svg]:size-4 [&_svg]:shrink-0";

const drawerLinkClasses =
  "flex min-h-12 items-center gap-3 rounded-control px-3 text-body font-semibold text-ink transition-colors hover:bg-surface-muted " +
  "aria-[current=page]:bg-surface-sunken [&_svg]:size-5 [&_svg]:text-ink-muted";

/** The shop header. Render it in the (store) layout; it needs no props. */
export async function StoreHeader() {
  const t = common;
  const s = searchMessages;
  const categories = await loadMenuCategories();
  const p = (path: string) => sitePath(path);

  // The combobox's texts (it is a Client Component: it gets only the strings it shows).
  const labels: SearchComboboxLabels = {
    label: s.label,
    suggestions: s.suggestions,
    services: s.services,
    filters: s.filters,
    recent: s.recent,
    clearRecent: s.clearRecent,
    popular: s.popular,
    fill: s.fill,
    didYouMean: s.didYouMean,
    taxNote: s.taxNote,
    status: s.status,
    country: s.country,
    brand: s.brand,
    network: s.network,
    category: s.category,
    inStock: t.availability.inStock,
    onRequest: t.availability.onRequest,
  };
  const searchCopy = (phone: boolean) => {
    const field = (
      <SearchInput
        action={p("/services")}
        label={t.header.searchLabel}
        placeholder={t.header.searchPlaceholder}
        submitLabel={t.actions.search}
        enhance
        autoFocus={phone}
      />
    );
    return (
      <SearchEnhancer labels={labels} paths={{ results: p("/services") }}>
        {field}
      </SearchEnhancer>
    );
  };

  const nav = (
    <>
      {/* prefetch: the catalog's first page comes with the prefetch, not after the click (plan P3.1).
          data-nav-default: the pill rests here on pages without a current link (the home page). */}
      <NavLink href={p("/services")} prefetch data-nav-default className={navLinkClasses}>
        <LayoutGrid aria-hidden="true" />
        {t.nav.allServices}
      </NavLink>
      <CategoryMenu
        categories={categories}
        label={t.nav.allCategories}
        listLabel={t.nav.categories}
        triggerClassName={navLinkClasses}
      />
      <NavLink href={p("/track")} className={navLinkClasses}>
        {t.nav.trackOrder}
      </NavLink>
      <NavLink href={p("/help")} className={navLinkClasses}>
        {t.nav.help}
      </NavLink>
      <span className="ms-auto" />
      <NavLink href={p("/support")} className={navLinkClasses}>
        <Headset aria-hidden="true" />
        {t.nav.support}
      </NavLink>
      <NavLink href={p("/merchant")} className={navLinkClasses}>
        <Store aria-hidden="true" />
        {t.nav.merchants}
      </NavLink>
    </>
  );

  const drawerContent = (
    <div className="grid gap-6">
      <nav aria-label={t.nav.label} className="grid gap-1">
        <NavLink href={p("/services")} prefetch className={drawerLinkClasses}>
          <LayoutGrid aria-hidden="true" />
          {t.nav.allServices}
        </NavLink>
        <CategoryDrawerList categories={categories} label={t.nav.categories} summaryClassName={drawerLinkClasses} />
        <NavLink href={p("/track")} className={drawerLinkClasses}>
          <PackageSearch aria-hidden="true" />
          {t.nav.trackOrder}
        </NavLink>
        <NavLink href={p("/help")} className={drawerLinkClasses}>
          <LifeBuoy aria-hidden="true" />
          {t.nav.help}
        </NavLink>
        <NavLink href={p("/support")} className={drawerLinkClasses}>
          <Headset aria-hidden="true" />
          {t.nav.support}
        </NavLink>
        <NavLink href={p("/merchant")} className={drawerLinkClasses}>
          <Store aria-hidden="true" />
          {t.nav.merchants}
        </NavLink>
      </nav>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <CurrencySwitcherSlot />
      </div>
    </div>
  );

  return (
    <StoreHeaderFrame
      logo={<Logo tagline />}
      search={searchCopy(false)}
      searchPhone={searchCopy(true)}
      switchers={<CurrencySwitcherSlot />}
      account={<AccountArea />}
      nav={nav}
      drawerContent={drawerContent}
      labels={{
        openSearch: t.header.openSearch,
        closeSearch: t.header.closeSearch,
        openMenu: t.header.openMenu,
        menuTitle: t.nav.menu,
      }}
    />
  );
}
