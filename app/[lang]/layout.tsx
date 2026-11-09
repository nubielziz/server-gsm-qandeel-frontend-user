// Root layout: one per language (`/en`, `/ar`). Sets <html lang dir>, the fonts and the error-text provider.
// Fully static: both languages are prerendered. Page chrome (store header, workspace shell …) lives in the
// route-group layouts below, not here.
import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
import { notFound } from "next/navigation";
import { LOCALES, dirOf, isLocale } from "@/lib/i18n/config";
import { errors } from "@/lib/i18n/messages/errors";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
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
  return {
    title: { default: ar ? "GSM Store — سوق الخدمات الرقمية" : "GSM Store — Digital Services Marketplace", template: "%s · GSM Store" },
    description: ar
      ? "فحص IMEI، فك الشبكات، تفعيل الأدوات والرصيد الرقمي لمحترفي صيانة الهواتف وعملائهم."
      : "IMEI checks, unlocks, tool activations and digital credits for GSM professionals and their customers.",
    alternates: { languages: { en: "/en", ar: "/ar" } },
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
    <html lang={lang} dir={dirOf(lang)} className={`${inter.variable} ${plexArabic.variable}`}>
      <body className="min-h-dvh bg-page font-sans text-ink antialiased">
        <ErrorTextProvider messages={errors[lang]}>{children}</ErrorTextProvider>
      </body>
    </html>
  );
}
