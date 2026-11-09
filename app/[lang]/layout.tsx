// Root layout: one per language (`/en`, `/ar`). Sets <html lang dir>, the fonts and the error-text provider.
// Fully static: both languages are prerendered. Page chrome (store header, workspace shell …) lives in the
// route-group layouts below, not here.
import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
import { notFound } from "next/navigation";
import { LOCALES, dirOf, isLocale } from "@/lib/i18n/config";
import { errors } from "@/lib/i18n/messages/errors";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { siteImage } from "@/lib/site-images";
import "../globals.css";

const inter = Inter({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-inter",
  display: "swap",
});

// Arabic glyphs only (unicode-range), so English pages never download it; not preloaded for the same reason.
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
  preload: false,
});

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  const ar = lang === "ar";
  const title = ar ? "GSM Store — سوق الخدمات الرقمية" : "GSM Store — Digital Services Marketplace";
  const description = ar
    ? "فحص IMEI، فك الشبكات، تفعيل الأدوات والرصيد الرقمي لمحترفي صيانة الهواتف وعملائهم."
    : "IMEI checks, unlocks, tool activations and digital credits for GSM professionals and their customers.";
  // The owner's share image (docs/IMAGE-PROMPTS.md); left out until the file exists.
  const ogImage = siteImage("og-default.jpg");
  return {
    // Absolute URLs for social cards and alternates. Set NEXT_PUBLIC_SITE_URL in production (https://<site>).
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:5175"),
    title: { default: title, template: "%s · GSM Store" },
    description,
    alternates: { languages: { en: "/en", ar: "/ar" } },
    openGraph: {
      siteName: "GSM Store",
      locale: ar ? "ar_JO" : "en_US",
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

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    // suppressHydrationWarning: browser extensions (translators, grammar checkers…) add attributes to <html> and
    // <body> before React starts. It covers only these two elements' own attributes, never the page content.
    <html lang={lang} dir={dirOf(lang)} className={`${inter.variable} ${plexArabic.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh bg-page font-sans text-ink antialiased" suppressHydrationWarning>
        <ErrorTextProvider messages={errors[lang]}>{children}</ErrorTextProvider>
      </body>
    </html>
  );
}
