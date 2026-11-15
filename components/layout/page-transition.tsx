// PageTransition: wrap a shop page's content in it (the page.tsx of each (store) route, not the layout: a layout stays
// mounted across navigations, so its enter and exit never run; Next docs, guides "View transitions"). On a client
// navigation the old page fades out and the new one fades in while it rises a few px (globals.css, "Page transitions").
// `default="none"`: updates in place (filters, search, refreshes) and Suspense reveals inside the page never animate.
// Next keeps a left page hidden in the DOM (cacheComponents); hiding it counts as its exit and showing it again as its
// enter. A first load never animates. Server-compatible.
import { ViewTransition, type ReactNode } from "react";

/** The page enter/exit view transition of the shop. One per page, around everything the page renders. */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {children}
    </ViewTransition>
  );
}
