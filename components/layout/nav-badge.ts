// The classes of the workspace navigation's number badge (the unread count, the orders in progress), shared by the
// server and client badges (workspace-badges.tsx, workspace-badges-client.tsx). Its colours come from the look it sits in
// (globals.css "Workspace rail and tab bar": `--badge-*` on the rail, the drawer row and the tab bar). Safe anywhere.

/** Size, shape and type of the number badge. Add `nav-badge-alert` (unread) or `nav-badge-count` (a plain count). */
export const NAV_BADGE =
  "nav-badge relative inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full px-1 text-[0.6875rem] font-bold leading-none";
