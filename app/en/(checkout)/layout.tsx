// Checkout: a slim header (logo, back to store, help, account) and the page on the grey background. No store footer.
import { ChromeProviders } from "@/components/layout/chrome-providers";
import { CheckoutHeader } from "@/components/layout/checkout-header";
import { SkipLink } from "@/components/layout/skip-link";

export default function CheckoutLayout({ children }: LayoutProps<"/en">) {
  return (
    <ChromeProviders>
      <SkipLink />
      <CheckoutHeader />
      <main id="main">{children}</main>
    </ChromeProviders>
  );
}
