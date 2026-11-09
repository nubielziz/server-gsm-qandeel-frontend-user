// WorkspaceShell (mockups Workspace / Settings / Invoices / Support): the frame of the signed-in areas.
// Desktop (lg+): a dark icon rail (80px, rounded, sticky) with the logo, nav icons (accessible label + tooltip),
// footer nav (settings) and the avatar; the main column starts with a white header card (breadcrumb + section title,
// search, header slot such as the wallet pill, avatar menu). Below lg: a top bar with a menu button that opens a
// start-side drawer with the labelled navigation.
// A layout passes plain data; pages render their own <PageHeader> and content as children. It reads no session
// itself: wrap the layout's session read in <Suspense fallback={<WorkspaceShellSkeleton />}>.
import { Suspense, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { localePath } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { common } from "@/lib/i18n/messages/common";
import { Avatar } from "@/components/ui/avatar";
import { Menu } from "@/components/ui/menu";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChromeProviders } from "./chrome-providers";
import { Logo } from "./logo";
import { SkipLink } from "./skip-link";
import { ActiveWorkspaceNav, WorkspaceHeading, WorkspaceHeadingView, WorkspaceMobileNav } from "./workspace-nav";
import { WorkspaceNavView, type WorkspaceNavItem } from "./workspace-nav-view";

export type { WorkspaceNavItem };

export type WorkspaceShellProps = {
  /** Main navigation (top of the rail / drawer). */
  nav: WorkspaceNavItem[];
  /** Secondary navigation pinned to the bottom of the rail (settings). */
  footerNav?: WorkspaceNavItem[];
  /** Name of the area for the breadcrumb ("Workspace", "My account"). */
  areaLabel: string;
  /** Where the area label and the rail logo go. Defaults to the shop home. */
  homeHref?: string;
  /** The signed-in person: avatar initials and the name beside the menu button. */
  user: { name: string; subtitle?: string };
  /** The avatar menu content: `MenuItem`s / `SignOutButton`s from components/ui/menu and ./sign-out-button. */
  userMenu: ReactNode;
  /** Header slot on the end side, before the avatar (the wallet pill). */
  headerSlot?: ReactNode;
  /** A search form in the header (shown from `md`). Omit for none. */
  search?: { action: string; label: string; placeholder: string; submitLabel: string };
  children: ReactNode;
};

/** The rail + header card + main column frame. Server component. */
export async function WorkspaceShell({
  nav,
  footerNav,
  areaLabel,
  homeHref,
  user,
  userMenu,
  headerSlot,
  search,
  children,
}: WorkspaceShellProps) {
  const [locale, t] = await Promise.all([getLocale(), getMessages(common)]);
  const home = homeHref ?? localePath(locale);
  const all = [...nav, ...(footerNav ?? [])];
  const headingProps = { areaLabel, areaHref: home, breadcrumbLabel: t.workspace.breadcrumbLabel };

  return (
    <ChromeProviders>
      <SkipLink />
      <div className="min-h-dvh bg-page p-3 sm:p-4">
        <div className="mx-auto flex w-full max-w-[110rem] items-start gap-4">
          {/* Rail (lg+) */}
          <div className="surface-inverse sticky top-4 hidden h-[calc(100dvh-2rem)] w-20 shrink-0 flex-col items-center rounded-panel py-4 lg:flex">
            <Logo variant="stacked" tone="inverse" href={home} />
            <nav aria-label={t.workspace.navLabel} className="mt-5 flex min-h-0 w-full flex-1 flex-col justify-between px-4">
              <Suspense fallback={<WorkspaceNavView items={nav} pathname={null} variant="rail" />}>
                <ActiveWorkspaceNav items={nav} variant="rail" />
              </Suspense>
              <div className="grid justify-items-center gap-4">
                {footerNav && footerNav.length > 0 ? (
                  <Suspense fallback={<WorkspaceNavView items={footerNav} pathname={null} variant="rail" />}>
                    <ActiveWorkspaceNav items={footerNav} variant="rail" />
                  </Suspense>
                ) : null}
                <Avatar name={user.name} size="md" tone="light" label={user.name} />
              </div>
            </nav>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <header className="flex min-h-[4.5rem] items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 shadow-card sm:px-5">
              <WorkspaceMobileNav
                items={nav}
                footerItems={footerNav}
                brand={<Logo href={home} />}
                labels={{ open: t.workspace.openNav, title: t.workspace.navLabel }}
              />
              <div className="min-w-0 flex-1 lg:flex-none lg:basis-72">
                <Suspense fallback={<WorkspaceHeadingView {...headingProps} />}>
                  <WorkspaceHeading items={all} {...headingProps} />
                </Suspense>
              </div>
              {search ? (
                <div className="hidden min-w-0 flex-1 justify-center md:flex">
                  <div className="w-full max-w-xl">
                    <SearchInput {...search} />
                  </div>
                </div>
              ) : (
                <div className="hidden flex-1 md:block" />
              )}
              <div className="ms-auto flex shrink-0 items-center gap-2 md:ms-0">
                {headerSlot}
                <Menu
                  label={t.workspace.accountMenu}
                  align="end"
                  triggerClassName="relative inline-flex min-h-11 items-center gap-2 rounded-control px-1.5 text-ink transition-colors hover:bg-surface-sunken sm:pe-2"
                  trigger={
                    <>
                      <Avatar name={user.name} size="md" />
                      <span className="hidden min-w-0 text-start xl:block">
                        <span className="block max-w-40 truncate text-small font-bold text-ink">{user.name}</span>
                        {user.subtitle ? (
                          <span className="block max-w-40 truncate text-caption text-ink-subtle">{user.subtitle}</span>
                        ) : null}
                      </span>
                      <ChevronDown aria-hidden="true" className="size-4 text-ink-subtle" />
                    </>
                  }
                >
                  {userMenu}
                </Menu>
              </div>
            </header>

            <main id="main" className="min-w-0 flex-1">
              {children}
            </main>
          </div>
        </div>
      </div>
    </ChromeProviders>
  );
}

/** A same-size placeholder of the shell for `<Suspense fallback>` around a layout's session read (no layout shift). */
export function WorkspaceShellSkeleton() {
  return (
    <div className="min-h-dvh bg-page p-3 sm:p-4" aria-busy="true">
      <div className="mx-auto flex w-full max-w-[110rem] items-start gap-4">
        <div className="sticky top-4 hidden h-[calc(100dvh-2rem)] w-20 shrink-0 rounded-panel bg-inverse lg:block" />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex min-h-[4.5rem] items-center gap-4 rounded-card border border-line bg-surface px-5 py-2.5 shadow-card">
            <Skeleton className="h-10 w-56" />
            <Skeleton className="ms-auto size-11 rounded-full" />
          </div>
          <div className="grid gap-4">
            <Skeleton className="h-20 rounded-card" />
            <Skeleton className="h-64 rounded-card" />
          </div>
        </div>
      </div>
    </div>
  );
}
