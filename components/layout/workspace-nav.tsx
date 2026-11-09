"use client";
// Client parts of the workspace shell that need the current pathname: the active nav list, the header heading and the
// mobile navigation drawer. The server wraps the first two in <Suspense> with a pure fallback (see workspace-shell.tsx).
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Drawer } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { isActivePath } from "./active-path";
import { WorkspaceNavView, type WorkspaceNavItem } from "./workspace-nav-view";

/** The nav list with the active item marked from the current pathname. */
export function ActiveWorkspaceNav({ items, variant }: { items: WorkspaceNavItem[]; variant: "rail" | "drawer" }) {
  return <WorkspaceNavView items={items} pathname={usePathname()} variant={variant} />;
}

/** The item whose href is the longest match of the pathname. */
function activeItem(items: WorkspaceNavItem[], pathname: string | null): WorkspaceNavItem | undefined {
  return items
    .filter((item) => isActivePath(pathname, item.href, item.match))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export type WorkspaceHeadingViewProps = {
  areaLabel: string;
  areaHref: string;
  breadcrumbLabel: string;
  active?: WorkspaceNavItem;
};

/** Breadcrumb ("Workspace / Orders") and the current section's title. Pure; also the server fallback. */
export function WorkspaceHeadingView({ areaLabel, areaHref, breadcrumbLabel, active }: WorkspaceHeadingViewProps) {
  return (
    <div className="min-w-0">
      {/* Phones have no room for the trail: only the title shows. */}
      <Breadcrumbs
        className="hidden sm:block"
        label={breadcrumbLabel}
        items={active ? [{ label: areaLabel, href: areaHref }, { label: active.label }] : [{ label: areaLabel }]}
      />
      {/* Not a heading: the page renders its own h1. */}
      <p className="min-h-7 truncate text-heading text-ink sm:mt-0.5">{active ? (active.title ?? active.label) : " "}</p>
    </div>
  );
}

/** The header card's heading, from the active nav item. */
export function WorkspaceHeading({
  items,
  ...rest
}: { items: WorkspaceNavItem[] } & Omit<WorkspaceHeadingViewProps, "active">) {
  return <WorkspaceHeadingView {...rest} active={activeItem(items, usePathname())} />;
}

export type WorkspaceMobileNavProps = {
  items: WorkspaceNavItem[];
  footerItems?: WorkspaceNavItem[];
  /** Server-rendered brand block shown at the top of the drawer. */
  brand: ReactNode;
  labels: { open: string; title: string };
};

/** The menu button (below `lg`) and the start-side drawer with the labelled navigation. */
export function WorkspaceMobileNav({ items, footerItems, brand, labels }: WorkspaceMobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <>
      <IconButton label={labels.open} aria-haspopup="dialog" variant="secondary" className="lg:hidden" onClick={() => setOpen(true)}>
        <Menu aria-hidden="true" />
      </IconButton>
      <Drawer side="start" size="sm" open={open} onClose={() => setOpen(false)} title={labels.title}>
        <div
          className="grid gap-6"
          onClick={(e) => {
            if (e.target instanceof Element && e.target.closest("a[href]")) setOpen(false);
          }}
        >
          <div>{brand}</div>
          <nav aria-label={labels.title} className="grid gap-4">
            <WorkspaceNavView items={items} pathname={pathname} variant="drawer" />
            {footerItems && footerItems.length > 0 ? (
              <div className="border-t border-line pt-4">
                <WorkspaceNavView items={footerItems} pathname={pathname} variant="drawer" />
              </div>
            ) : null}
          </nav>
        </div>
      </Drawer>
    </>
  );
}
