"use client";
// StoreHeaderFrame: the interactive skeleton of the shop header. It only holds the two toggles (mobile search row and
// mobile menu drawer); everything inside is server-rendered and handed over as slots.
// The menu drawer is uncontrolled (`id` mode) and its button is a native `show-modal` command, so the menu opens from the
// server HTML at first paint instead of after hydration (plan P4.1: 13 of 15 early taps were lost before).
// The phone search row is a popover (`popover="auto"`: Esc and a tap outside close it) under the bar, opened by its
// button's declarative `popovertarget`, so a tap before hydration works too; its field carries `autofocus`, so the
// popover's own focusing steps focus it inside the tap and iOS Safari opens the keyboard (a `toggle` listener would run
// outside the user activation). Both copies of the search form are always in the page (backend plan 29 §7), so their
// ids come from the search enhancer, never from the server.
// The desktop nav row is NavRow (./nav-row.tsx: the sliding pill). The header is named `site-header` for view
// transitions (`.vt-site-header`, globals.css): it stays still while a page change animates the content below it.
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Menu as MenuIcon, Search, X } from "lucide-react";
import { Drawer, openDialog } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Container } from "./container";
import { NavRow } from "./nav-row";

export type StoreHeaderFrameProps = {
  logo: ReactNode;
  /** The search form of the desktop bar. */
  search: ReactNode;
  /** The search form of the phone row (its field carries `autofocus`); defaults to `search`. */
  searchPhone?: ReactNode;
  /** The currency picker and the theme switch (desktop bar; on phones they are in the drawer). */
  switchers: ReactNode;
  /** Sign-in button or account menu. */
  account: ReactNode;
  /** Desktop navigation row. */
  nav: ReactNode;
  /** Content of the mobile menu drawer (links and pickers). */
  drawerContent: ReactNode;
  labels: { openSearch: string; closeSearch: string; openMenu: string; menuTitle: string };
};

/**
 * Closes the menu drawer when a link inside it is clicked (after hydration; before it, the link does a full page load).
 * The drawer is uncontrolled, so the dialog element itself is closed.
 */
function closeOnLinkClick(event: MouseEvent<HTMLElement>) {
  if (event.target instanceof Element && event.target.closest("a[href]")) event.currentTarget.closest("dialog")?.close();
}

/** The shop header layout: top bar, optional mobile search row, desktop nav row and the mobile menu drawer. */
export function StoreHeaderFrame({ logo, search, searchPhone, switchers, account, nav, drawerContent, labels }: StoreHeaderFrameProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRow = useRef<HTMLDivElement>(null);
  // One id per header: Next can keep a previous page (and its header) hidden in the DOM, and a command finds the first
  // element with its id.
  const base = useId();
  const menuId = `${base}-menu`;
  const rowId = `${base}-search`;

  // A header rendered in the browser (a navigation from another area) has no `autofocus` attribute (React sets it only
  // in server HTML): add it, so the popover's focusing steps still focus the field inside the tap.
  useEffect(() => {
    searchRow.current?.querySelector("input")?.setAttribute("autofocus", "");
  }, []);

  return (
    <header className="vt-site-header border-b border-line bg-surface">
      <Container width="wide" className="flex h-16 items-center gap-2 sm:gap-3 lg:gap-6">
        {logo}
        <div className="hidden min-w-0 flex-1 justify-center lg:flex">
          <div className="w-full max-w-2xl">{search}</div>
        </div>
        <div className="ms-auto flex items-center gap-1 lg:ms-0">
          <div className="hidden items-center gap-1 lg:flex">{switchers}</div>
          {/* A declarative popover invoker: the browser toggles the row (and reports it expanded) before hydration too. */}
          <IconButton
            label={searchOpen ? labels.closeSearch : labels.openSearch}
            className="lg:hidden"
            popoverTarget={rowId}
            popoverTargetAction="toggle"
          >
            {searchOpen ? <X aria-hidden="true" /> : <Search aria-hidden="true" />}
          </IconButton>
          <div className="ms-1">{account}</div>
          <IconButton
            label={labels.openMenu}
            aria-haspopup="dialog"
            className="lg:hidden"
            command="show-modal"
            commandfor={menuId}
            onClick={() => openDialog(menuId)}
          >
            <MenuIcon aria-hidden="true" />
          </IconButton>
        </div>
      </Container>

      {/* The phone row: in the top layer, laid over the page right under the 4 rem bar (the header is the first box of
          the page), so opening it moves nothing. Hidden from `lg` up, where the bar holds the search. */}
      <div
        ref={searchRow}
        id={rowId}
        popover="auto"
        className="absolute inset-x-0 top-16 bottom-auto m-0 w-auto overflow-visible border-x-0 border-y border-line bg-surface p-0 text-ink shadow-raised lg:hidden"
        onToggle={(event) => {
          // React bubbles `toggle`: the combobox's own popover panel inside the row fires it each time it shows or hides,
          // and only the row's toggle may change the button or move the focus.
          if (event.target !== event.currentTarget) return;
          const opened = event.newState === "open";
          setSearchOpen(opened);
          // The focusing steps already focused the field inside the tap; this covers a browser that did not.
          const field = event.currentTarget.querySelector("input");
          if (opened && field && document.activeElement !== field) field.focus();
        }}
      >
        <Container width="wide" className="py-3">
          {searchPhone ?? search}
        </Container>
      </div>

      <div className="hidden border-t border-line lg:block">
        <NavRow>{nav}</NavRow>
      </div>

      <Drawer id={menuId} side="start" size="sm" title={labels.menuTitle}>
        <div onClick={closeOnLinkClick}>{drawerContent}</div>
      </Drawer>
    </header>
  );
}
