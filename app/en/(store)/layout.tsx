// The public shop frame: skip link, header (search, switchers, account area, nav), the page, the dark footer, and the
// @modal slot (the quick view dialog, empty unless one is open). Nothing here reads the session at the top level: the
// account area and the currency picker sit in their own <Suspense> boundaries, so the rest of the frame is prerendered.
// The personal price layer (decision 003) wraps it all: in the browser, an account of a merchant rank sees its own price in
// every price slot of the header search, the pages and the quick view; it reads nothing on the server.
import type { ReactNode } from "react";
import { ChromeProviders } from "@/components/layout/chrome-providers";
import { SkipLink } from "@/components/layout/skip-link";
import { StoreFooter } from "@/components/layout/store-footer";
import { StoreHeader } from "@/components/layout/store-header";
import { OwnPricesLayer } from "@/components/store/own-price";
import { store } from "@/lib/i18n/messages/store";

export default function StoreLayout({ children, modal }: LayoutProps<"/en"> & { modal: ReactNode }) {
  return (
    <ChromeProviders>
      <OwnPricesLayer labels={store.ownPrice}>
        <SkipLink />
        <StoreHeader />
        <main id="main">{children}</main>
        <StoreFooter />
        {modal}
      </OwnPricesLayer>
    </ChromeProviders>
  );
}
