// WorkspaceShell (mockups Workspace / Settings / Invoices / Support): the frame of the signed-in areas.
// Desktop (lg+): a dark icon rail (80px, rounded, sticky) at the start edge with the logo, nav icons (accessible label +
// tooltip, live badges), footer nav (settings) and the avatar; the main column takes the rest of the width (up to a
// comfortable 120rem, never leaving a strip at the start edge) and starts with a white header card (breadcrumb + section
// title, search, header slot such as the wallet pill, avatar menu). Below lg: a top bar with a menu button that opens a
// start-side drawer with the labelled navigation, and a fixed bottom tab bar with the key destinations.
// The rail and the tab bar mark the current page with one sliding indicator each (sliding-nav.tsx). On a client
// navigation the page plays the shop's enter/exit view transition (each page wraps itself in <PageTransition>) while the
// rail, the header card and the tab bar are named and held still (globals.css "Page transitions").
//
// The frame is part of the static shell (plan P1.4; Next guide "Optimizing the static shell", "Keep static UI in the
// shell"): the rail, the header card with the section title, the menu button and drawer, the account menu and the main
// area are prerendered, so the page has text on screen at first paint instead of a skeleton until the session is read.
// Nothing personal is in it. The parts that depend on who is signed in are small holes with their own <Suspense> and a
// same-size fallback, each read by an async function the layout passes (`resolveNav`, `resolveUser`): the nav lists
// when the session decides which links exist, the search form (when a layout's search depends on the session) and the avatar
// with the name. A layout puts its session gate and its own holes (wallet pill, bell) in `headerSlot` / `children`.
import { Suspense, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { sitePath } from "@/lib/site-path";
import { common } from "@/lib/i18n/messages/common";
import { Avatar } from "@/components/ui/avatar";
import { Menu } from "@/components/ui/menu";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChromeProviders } from "./chrome-providers";
import { Logo } from "./logo";
import { SkipLink } from "./skip-link";
import { SlidingNav } from "./sliding-nav";
import { ActiveWorkspaceNav, WorkspaceHeading, WorkspaceHeadingView, WorkspaceMobileNav } from "./workspace-nav";
import { headingItems, WorkspaceNavView, type WorkspaceNavItem, type WorkspaceTitleItem } from "./workspace-nav-view";

export type { WorkspaceNavItem, WorkspaceTitleItem };

/** The nav lists once the session is known. */
export type WorkspaceNavLists = {
  /** Main navigation (top of the rail / drawer). */
  nav: WorkspaceNavItem[];
  /** Secondary navigation pinned to the bottom of the rail (settings). */
  footerNav?: WorkspaceNavItem[];
  /** The phone tab bar's destinations (4 or 5, with `shortLabel`s). */
  tabs?: WorkspaceNavItem[];
};

/** A search form of the header: where it goes (GET) and its words. */
export type WorkspaceSearch = { action: string; label: string; placeholder: string; submitLabel: string };

/** The signed-in person. */
export type WorkspaceUser = {
  /** Avatar initials and the name beside the menu button. */
  name: string;
  /** Small line under the name (the role, a company). */
  subtitle?: string;
};

export type WorkspaceShellProps = {
  /**
   * Main navigation as the static shell shows it, before the session is read (top of the rail / drawer): every link an
   * account might have. An item the session may take away (a retail account's wallet) is `reserve`d, which holds its place.
   * Every item here also names its page for the header title, so the title is right in the static shell.
   */
  nav: WorkspaceNavItem[];
  /**
   * Pages that are not in the static `nav` but still need their header title in the static shell: the places only some
   * accounts have (a merchant rank's invoices). They are never drawn as links; the heading reads them.
   */
  titles?: WorkspaceTitleItem[];
  /** Secondary navigation pinned to the bottom of the rail (settings), as the static shell shows it. */
  footerNav?: WorkspaceNavItem[];
  /**
   * The phone tab bar (below `lg`, where the rail is hidden), as the static shell shows it: 4 or 5 key destinations with
   * short labels; the drawer keeps the full list. `resolveNav` returns the session's own list (`tabs`). Omit for none.
   */
  tabs?: WorkspaceNavItem[];
  /**
   * Reads the session and returns the final lists (the places the account's rank adds, the wallet item when it shows). It
   * runs inside <Suspense>; the static `nav` shows until it returns. Leave it out when every account has the same links.
   */
  resolveNav?: () => Promise<WorkspaceNavLists>;
  /** Name of the area for the breadcrumb ("Workspace", "My account"). */
  areaLabel: string;
  /** Where the area label and the rail logo go. Defaults to the shop home. */
  homeHref?: string;
  /** A line in words ("Your account"): shown under the name's placeholder while the session is read. */
  roleLabel: string;
  /** Reads the signed-in person (and sends a signed-out visitor to sign-in). Runs inside <Suspense>. */
  resolveUser: () => Promise<WorkspaceUser>;
  /** The avatar menu content: `MenuItem`s / `SignOutButton`s from components/ui/menu and ./sign-out-button. Static. */
  userMenu: ReactNode;
  /** Header slot on the end side, before the avatar (the bell, the wallet pill). Anything personal needs its own <Suspense>. */
  headerSlot?: ReactNode;
  /** A search form in the header (shown from `md`), as the static shell draws it. Omit for none. */
  search?: WorkspaceSearch;
  /**
   * Reads the session and returns the search form the account uses, for a layout whose search depends on the session. It runs
   * inside <Suspense>; `search` shows until it returns, so it must be given too.
   */
  resolveSearch?: () => Promise<WorkspaceSearch>;
  /** The page. Personal content needs its own <Suspense> (the layout adds the page-wide one and the session gate). */
  children: ReactNode;
};

/** Short screens (under 46rem) drop the rail's avatar to make room for the links (the header menu shows it too). */
const RAIL_AVATAR_HIDE = "[@media(max-height:46rem)]:hidden";

type NavVariant = "rail" | "drawer" | "tabs";

/** The static nav list: the active link is marked where the pathname is known when the page is prerendered. */
function StaticNav({ items, variant }: { items: WorkspaceNavItem[]; variant: NavVariant }) {
  return (
    <Suspense fallback={<WorkspaceNavView items={items} pathname={null} variant={variant} />}>
      <ActiveWorkspaceNav items={items} variant={variant} />
    </Suspense>
  );
}

type NavGroup = "main" | "footer" | "tabs";

type NavGroupProps = {
  group: NavGroup;
  variant: NavVariant;
  nav: WorkspaceNavItem[];
  footerNav?: WorkspaceNavItem[];
  tabs?: WorkspaceNavItem[];
  resolveNav?: () => Promise<WorkspaceNavLists>;
};

/** The items of one group of a set of lists. */
function itemsOf(group: NavGroup, lists: WorkspaceNavLists): WorkspaceNavItem[] {
  if (group === "main") return lists.nav;
  return (group === "footer" ? lists.footerNav : lists.tabs) ?? [];
}

type ResolvedNavProps = Pick<NavGroupProps, "group" | "variant"> & { resolveNav: () => Promise<WorkspaceNavLists> };

async function ResolvedNav({ group, variant, resolveNav }: ResolvedNavProps) {
  const lists = await resolveNav();
  return <StaticNav items={itemsOf(group, lists)} variant={variant} />;
}

/** One nav list: the static one in the shell, replaced by the session's own once `resolveNav` returns. */
function NavGroup({ group, variant, nav, footerNav, tabs, resolveNav }: NavGroupProps) {
  const fixed = <StaticNav items={itemsOf(group, { nav, footerNav, tabs })} variant={variant} />;
  if (!resolveNav) return fixed;
  return (
    <Suspense fallback={fixed}>
      <ResolvedNav group={group} variant={variant} resolveNav={resolveNav} />
    </Suspense>
  );
}

/** The header's search form as the session's account uses it. Same boxes as the static one: nothing moves when it swaps in. */
async function ResolvedSearch({ resolveSearch }: { resolveSearch: () => Promise<WorkspaceSearch> }) {
  return <SearchInput {...await resolveSearch()} />;
}

/** The rail's avatar: initials of the signed-in person. */
async function RailAvatar({ resolveUser }: { resolveUser: () => Promise<WorkspaceUser> }) {
  const user = await resolveUser();
  return <Avatar name={user.name} size="md" tone="light" label={user.name} className={RAIL_AVATAR_HIDE} />;
}

/** The menu button's content: avatar and, from `xl`, the name with a small line under it. */
async function UserTrigger({ resolveUser }: { resolveUser: () => Promise<WorkspaceUser> }) {
  const user = await resolveUser();
  return (
    <>
      <Avatar name={user.name} size="md" />
      <span className="hidden min-w-0 text-start xl:block">
        <span className="block max-w-40 truncate text-small font-bold text-ink">{user.name}</span>
        {user.subtitle ? <span className="block max-w-40 truncate text-caption text-ink-subtle">{user.subtitle}</span> : null}
      </span>
    </>
  );
}

/** The same boxes as `UserTrigger`, with the role in words where the name will be. Spans only: it sits inside a button. */
function UserTriggerFallback({ roleLabel }: { roleLabel: string }) {
  return (
    <>
      <span aria-hidden="true" className="skeleton size-10 rounded-full" />
      <span className="hidden min-w-0 text-start xl:block">
        <span aria-hidden="true" className="skeleton block h-auto w-24 text-small">
          &nbsp;
        </span>
        <span className="block max-w-40 truncate text-caption text-ink-subtle">{roleLabel}</span>
      </span>
    </>
  );
}

/** The rail, the header card, the main column and the phone drawer. Server component, static (no session read). */
export function WorkspaceShell({
  nav,
  titles,
  footerNav,
  tabs,
  resolveNav,
  areaLabel,
  homeHref,
  roleLabel,
  resolveUser,
  userMenu,
  headerSlot,
  search,
  resolveSearch,
  children,
}: WorkspaceShellProps) {
  const t = common;
  const home = homeHref ?? sitePath();
  // The heading only names the page: it gets the paths and the words, no icons or badges (each would be rendered for nothing).
  const all = headingItems(nav, footerNav, titles);
  const headingProps = { areaLabel, areaHref: home, breadcrumbLabel: t.workspace.breadcrumbLabel };
  const lists = { nav, footerNav, tabs, resolveNav };
  const hasTabs = Boolean(tabs && tabs.length > 0);

  return (
    <ChromeProviders>
      <SkipLink />
      {/* `relative overflow-x-clip`: the page never scrolls sideways. A visually hidden (`sr-only`, absolute) label inside a
          table's scroll box has no positioned ancestor, so it escaped that box and widened the document (a blank strip
          beside the frame, the rail pushed off screen). `clip` is not a scroll container: the sticky rail keeps working.
          No centred max width on the frame (owner, 2026-11-15): the rail sits at the start edge with the page padding
          only, and the main column takes the rest. Below `lg` the bottom padding keeps the page clear of the tab bar. */}
      <div
        className={cn(
          "relative min-h-dvh overflow-x-clip bg-page p-3 sm:p-4",
          hasTabs && "pb-[calc(var(--ws-tabbar-h)+env(safe-area-inset-bottom,0px)+0.75rem)] sm:pb-[calc(var(--ws-tabbar-h)+env(safe-area-inset-bottom,0px)+1rem)] lg:pb-4",
        )}
      >
        <div className="flex w-full items-start gap-4">
          {/* Rail (lg+). At least the screen's height; on a short screen it grows with its links (the longest list has eight)
              instead of letting them spill below the dark panel. Above the main column (`z-20`): its tooltips reach over
              the page. Named for page transitions: held still while the page changes. */}
          <div className="surface-inverse vt-workspace-rail sticky top-4 z-20 hidden min-h-[calc(100dvh-2rem)] w-20 shrink-0 flex-col items-center rounded-panel py-4 lg:flex">
            <Logo variant="stacked" tone="inverse" href={home} />
            <SlidingNav
              label={t.workspace.navLabel}
              className="ws-rail relative mt-5 flex min-h-0 w-full flex-1 flex-col justify-between px-4"
              indicatorClassName="ws-rail-indicator"
            >
              <NavGroup group="main" variant="rail" {...lists} />
              <div className="grid justify-items-center gap-4">
                {footerNav && footerNav.length > 0 ? <NavGroup group="footer" variant="rail" {...lists} /> : null}
                {/* The header's account menu shows the same avatar: on short screens the rail drops it to fit. */}
                <Suspense fallback={<span aria-hidden="true" className={`size-10 rounded-full bg-inverse-raised ${RAIL_AVATAR_HIDE}`} />}>
                  <RailAvatar resolveUser={resolveUser} />
                </Suspense>
              </div>
            </SlidingNav>
          </div>

          <div className="flex min-w-0 max-w-[120rem] flex-1 flex-col gap-4">
            <header className="vt-workspace-header flex min-h-[4.5rem] items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 shadow-card sm:px-5">
              <WorkspaceMobileNav brand={<Logo href={home} />} labels={{ open: t.workspace.openNav, title: t.workspace.navLabel }}>
                <NavGroup group="main" variant="drawer" {...lists} />
                {footerNav && footerNav.length > 0 ? (
                  <div className="border-t border-line pt-4">
                    <NavGroup group="footer" variant="drawer" {...lists} />
                  </div>
                ) : null}
              </WorkspaceMobileNav>
              <div className="min-w-0 flex-1 lg:flex-none lg:basis-72">
                <Suspense fallback={<WorkspaceHeadingView {...headingProps} />}>
                  <WorkspaceHeading items={all} {...headingProps} />
                </Suspense>
              </div>
              {search ? (
                <div className="hidden min-w-0 flex-1 justify-center md:flex">
                  <div className="w-full max-w-xl">
                    {resolveSearch ? (
                      <Suspense fallback={<SearchInput {...search} />}>
                        <ResolvedSearch resolveSearch={resolveSearch} />
                      </Suspense>
                    ) : (
                      <SearchInput {...search} />
                    )}
                  </div>
                </div>
              ) : (
                <div className="hidden flex-1 md:block" />
              )}
              <div className="ms-auto flex shrink-0 items-center gap-2 md:ms-0">
                {headerSlot}
                {/* The menu button and its panel are static (the popover opens before hydration too); only what the
                    button shows, the avatar and the name, waits for the session. */}
                <Menu
                  label={t.workspace.accountMenu}
                  align="end"
                  triggerClassName="relative inline-flex min-h-11 items-center gap-2 rounded-control px-1.5 text-ink transition-colors hover:bg-surface-sunken sm:pe-2"
                  trigger={
                    <>
                      <Suspense fallback={<UserTriggerFallback roleLabel={roleLabel} />}>
                        <UserTrigger resolveUser={resolveUser} />
                      </Suspense>
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
      {/* Phone tab bar (below lg): the key destinations, the active one marked by a pill that slides sideways. Fixed to
          the bottom above the safe area; the frame's bottom padding keeps the page clear of it. Outside the frame so its
          horizontal clip never reaches it. Named for page transitions: held still while the page changes. */}
      {hasTabs ? (
        <SlidingNav
          label={t.workspace.tabsLabel}
          target=".tab-icon"
          className="ws-tabs vt-workspace-tabs fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
          indicatorClassName="ws-tab-indicator"
        >
          <NavGroup group="tabs" variant="tabs" {...lists} />
        </SlidingNav>
      ) : null}
    </ChromeProviders>
  );
}

/** A same-size placeholder of the main area for a layout's page-wide <Suspense> (no layout shift). */
export function WorkspaceMainSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true">
      <Skeleton className="h-20 rounded-card" />
      <Skeleton className="h-64 rounded-card" />
    </div>
  );
}
