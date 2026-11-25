// Root layout of the site's one language: the plain folder `app/en` (decision 039; Next allows a root layout inside any
// folder). Sets <html lang dir>, the font, the theme and the error-text provider. Fully static: prerendered once. Page chrome
// (store header, workspace shell …) lives in the route-group layouts below, not here. A URL outside /en never gets here:
// proxy.ts sends it to /en and next.config.ts answers an old Arabic address with a permanent redirect.
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { errors } from "@/lib/i18n/messages/errors";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { siteImage } from "@/lib/site-images";
import { ViewTransitionGuard } from "@/components/layout/view-transition-guard";
import { OWN_PRICES_GUARD } from "@/lib/store/own-prices";
import { THEME_GUARD } from "@/lib/theme/theme";
import "../globals.css";

// Latin letters and digits. No `opsz` axis: the file stays a plain weight-only variable font (48 KB instead of 73 KB),
// at the cost of slightly different glyph shapes at hero sizes (Next docs, font, `axes`).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const title = "IMEI-HUB — GSM Services & IMEI Solutions";
const description = "IMEI checks, unlocks, tool activations and digital credits for GSM professionals and their customers.";

export async function generateMetadata(): Promise<Metadata> {
  // The owner's share image (docs/IMAGE-PROMPTS.md); left out until the file exists.
  const ogImage = siteImage("og-default.jpg");
  return {
    // Absolute URLs for social cards and canonicals. Set NEXT_PUBLIC_SITE_URL in production (https://<site>).
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:5175"),
    title: { default: title, template: "%s · IMEI-HUB" },
    description,
    openGraph: {
      siteName: "IMEI-HUB",
      locale: "en_US",
      type: "website",
      title,
      description,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : undefined,
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The browser's own bars (a phone's address bar) follow the system theme: a <meta name="theme-color"> cannot read the
  // visitor's choice on the page. The colours are the page background of each theme (--color-page, app/globals.css).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
  // Both themes are drawn, so the browser's own widgets (scrollbars, form controls) may follow `data-theme` (globals.css).
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/en">) {
  return (
    // suppressHydrationWarning: browser extensions (translators, grammar checkers…) and the two guard scripts below (the theme
    // sets `data-theme`, the personal prices set `data-own-prices`) add attributes to <html> and <body> before React starts.
    // It covers only these two elements' own attributes, never the page content.
    <html lang="en" dir="ltr" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-page font-sans text-ink antialiased" suppressHydrationWarning>
        {/* The theme's guard (lib/theme/theme.ts): the first thing in the body, so it runs while the HTML is read, before
            anything is painted, and a dark visitor never sees the light page first. It sets `data-theme` on <html> from the
            stored choice or the system, and keeps following both. Covered by suppressHydrationWarning; the root layout is
            never rendered again on the client. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_GUARD }} />
        {/* The personal price layer's guard (decision 003): runs while the HTML is read, before the first paint, so a browser
            that holds a merchant session never shows a public price the server drew as if it were its own. It only marks
            <html> (covered by suppressHydrationWarning); the root layout is never rendered again on the client. */}
        <script dangerouslySetInnerHTML={{ __html: OWN_PRICES_GUARD }} />
        <ViewTransitionGuard />
        <ErrorTextProvider messages={errors}>{children}</ErrorTextProvider>
      </body>
    </html>
  );
}
