// Root layout of the site's one language: the plain folder `app/en` (decision 039; Next allows a root layout inside any
// folder). Sets <html lang dir>, the font and the error-text provider. Fully static: prerendered once. Page chrome
// (store header, workspace shell …) lives in the route-group layouts below, not here. A URL outside /en never gets here:
// proxy.ts sends it to /en and next.config.ts answers an old Arabic address with a permanent redirect.
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { errors } from "@/lib/i18n/messages/errors";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { siteImage } from "@/lib/site-images";
import { ViewTransitionGuard } from "@/components/layout/view-transition-guard";
import "../globals.css";

// Latin letters and digits. No `opsz` axis: the file stays a plain weight-only variable font (48 KB instead of 73 KB),
// at the cost of slightly different glyph shapes at hero sizes (Next docs, font, `axes`).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const title = "GSM Store — Digital Services Marketplace";
const description = "IMEI checks, unlocks, tool activations and digital credits for GSM professionals and their customers.";

export async function generateMetadata(): Promise<Metadata> {
  // The owner's share image (docs/IMAGE-PROMPTS.md); left out until the file exists.
  const ogImage = siteImage("og-default.jpg");
  return {
    // Absolute URLs for social cards and canonicals. Set NEXT_PUBLIC_SITE_URL in production (https://<site>).
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:5175"),
    title: { default: title, template: "%s · GSM Store" },
    description,
    openGraph: {
      siteName: "GSM Store",
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
  themeColor: "#f4f4f5",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/en">) {
  return (
    // suppressHydrationWarning: browser extensions (translators, grammar checkers…) add attributes to <html> and
    // <body> before React starts. It covers only these two elements' own attributes, never the page content.
    <html lang="en" dir="ltr" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-page font-sans text-ink antialiased" suppressHydrationWarning>
        <ViewTransitionGuard />
        <ErrorTextProvider messages={errors}>{children}</ErrorTextProvider>
      </body>
    </html>
  );
}
