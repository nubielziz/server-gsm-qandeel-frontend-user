"use client";
// StoreHeaderFrame: the interactive skeleton of the shop header. It only holds the two toggles (mobile search row and
// mobile menu drawer); everything inside is server-rendered and handed over as slots.
// The menu drawer is uncontrolled (`id` mode) and its button is a native `show-modal` command, so the menu opens from the
// server HTML at first paint instead of after hydration (plan P4.1: 13 of 15 early taps were lost before).
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
  /** The search form. Rendered once in the desktop bar and once in the mobile search row. */
  search: ReactNode;
  /** Currency + language pickers (desktop bar). */
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
export function StoreHeaderFrame({ logo, search, switchers, account, nav, drawerContent, labels }: StoreHeaderFrameProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRow = useRef<HTMLDivElement>(null);
  // One id per header: Next can keep a previous page (and its header) hidden in the DOM, and a command finds the first
  // element with its id.
  const menuId = `${useId()}-menu`;

  useEffect(() => {
    if (searchOpen) searchRow.current?.querySelector("input")?.focus();
  }, [searchOpen]);

  return (
    <header className="vt-site-header border-b border-line bg-surface">
      <Container width="wide" className="flex h-16 items-center gap-2 sm:gap-3 lg:gap-6">
        {logo}
        <div className="hidden min-w-0 flex-1 justify-center lg:flex">
          <div className="w-full max-w-2xl">{search}</div>
        </div>
        <div className="ms-auto flex items-center gap-1 lg:ms-0">
          <div className="hidden items-center gap-1 lg:flex">{switchers}</div>
          <IconButton
            label={searchOpen ? labels.closeSearch : labels.openSearch}
            aria-expanded={searchOpen}
            className="lg:hidden"
            onClick={() => setSearchOpen((v) => !v)}
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

      {searchOpen ? (
        <div ref={searchRow} className="border-t border-line lg:hidden">
          <Container width="wide" className="py-3">
            {search}
          </Container>
        </div>
      ) : null}

      <div className="hidden border-t border-line lg:block">
        <NavRow>{nav}</NavRow>
      </div>

      <Drawer id={menuId} side="start" size="sm" title={labels.menuTitle}>
        <div onClick={closeOnLinkClick}>{drawerContent}</div>
      </Drawer>
    </header>
  );
}
