"use client";
// Client parts of the workspace shell: the active nav list and the header heading (both need the current pathname; the
// server wraps them in <Suspense> with a pure fallback, see workspace-shell.tsx) and the mobile navigation drawer.
import { usePathname } from "next/navigation";
import { useId, type MouseEvent, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Drawer, openDialog } from "@/components/ui/dialog";
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
  /** Server-rendered brand block shown at the top of the drawer. */
  brand: ReactNode;
  /** The navigation lists, rendered by the server (they stream: the session decides which links the account has). */
  children: ReactNode;
  labels: { open: string; title: string };
};

/**
 * Closes the drawer when a link inside it is clicked (after hydration; before it, the link does a full page load). The
 * drawer is uncontrolled, so the dialog element itself is closed.
 */
function closeOnLinkClick(event: MouseEvent<HTMLElement>) {
  if (event.target instanceof Element && event.target.closest("a[href]")) event.currentTarget.closest("dialog")?.close();
}

/**
 * The menu button (below `lg`) and the start-side drawer with the labelled navigation. The drawer is uncontrolled (`id`
 * mode) and the button is a native `show-modal` command, so the menu opens from the server HTML at first paint instead of
 * after hydration (plan P1.2 = P4.1). The button's `onClick` is the fallback for browsers without invoker commands; where
 * both run, the click opens the dialog first and the command then finds it open and does nothing. It does not read the
 * pathname, so nothing here suspends: the active link is marked inside the lists the server passes as `children`.
 */
export function WorkspaceMobileNav({ brand, labels, children }: WorkspaceMobileNavProps) {
  // One id per shell: Next can keep a previous page (and its shell) hidden in the DOM, and a command finds the first
  // element with its id.
  const drawerId = `${useId()}-nav`;
  return (
    <>
      <IconButton
        label={labels.open}
        aria-haspopup="dialog"
        variant="secondary"
        className="lg:hidden"
        command="show-modal"
        commandfor={drawerId}
        onClick={() => openDialog(drawerId)}
      >
        <Menu aria-hidden="true" />
      </IconButton>
      <Drawer id={drawerId} side="start" size="sm" title={labels.title}>
        <div className="grid gap-6" onClick={closeOnLinkClick}>
          <div>{brand}</div>
          <nav aria-label={labels.title} className="grid gap-4">
            {children}
          </nav>
        </div>
      </Drawer>
    </>
  );
}
