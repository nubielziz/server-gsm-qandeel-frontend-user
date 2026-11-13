// The public shop frame: skip link, header (search, switchers, account area, nav), the page, the dark footer, and the
// @modal slot (the quick view dialog, empty unless one is open). Nothing here reads the session at the top level: the
// account area and the currency picker sit in their own <Suspense> boundaries, so the rest of the frame is prerendered.
import type { ReactNode } from "react";
import { ChromeProviders } from "@/components/layout/chrome-providers";
import { SkipLink } from "@/components/layout/skip-link";
import { StoreFooter } from "@/components/layout/store-footer";
import { StoreHeader } from "@/components/layout/store-header";

export default function StoreLayout({ children, modal }: LayoutProps<"/[lang]"> & { modal: ReactNode }) {
  return (
    <ChromeProviders>
      <SkipLink />
      <StoreHeader />
      <main id="main">{children}</main>
      <StoreFooter />
      {modal}
    </ChromeProviders>
  );
}
