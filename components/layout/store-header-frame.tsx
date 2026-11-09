"use client";
// StoreHeaderFrame: the interactive skeleton of the shop header. It only holds the two toggles (mobile search row and
// mobile menu drawer); everything inside is server-rendered and handed over as slots.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu as MenuIcon, Search, X } from "lucide-react";
import { Drawer } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Container } from "./container";

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

/** The shop header layout: top bar, optional mobile search row, desktop nav row and the mobile menu drawer. */
export function StoreHeaderFrame({ logo, search, switchers, account, nav, drawerContent, labels }: StoreHeaderFrameProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRow = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchOpen) searchRow.current?.querySelector("input")?.focus();
  }, [searchOpen]);

  return (
    <header className="border-b border-line bg-surface">
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
          <IconButton label={labels.openMenu} aria-haspopup="dialog" className="lg:hidden" onClick={() => setMenuOpen(true)}>
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
        <Container width="wide" className="flex h-14 items-center gap-1">
          {nav}
        </Container>
      </div>

      <Drawer side="start" size="sm" open={menuOpen} onClose={() => setMenuOpen(false)} title={labels.menuTitle}>
        <div
          onClick={(e) => {
            if (e.target instanceof Element && e.target.closest("a[href]")) setMenuOpen(false);
          }}
        >
          {drawerContent}
        </div>
      </Drawer>
    </header>
  );
}
