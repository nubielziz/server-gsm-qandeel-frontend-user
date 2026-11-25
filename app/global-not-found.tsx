// 404 for URLs that match no route at all (the root layout sits under app/en, so it cannot render these).
// Rare in practice: proxy.ts sends every path that does not start with /en to /en first.
// It is its own document, so it runs the theme's guard too (the root layout's, lib/theme/theme.ts): a dark visitor gets a dark 404.
import type { Metadata } from "next";
import Link from "next/link";
import { THEME_GUARD } from "@/lib/theme/theme";
import "./globals.css";

export const metadata: Metadata = { title: "Page not found · IMEI-HUB" };

export default function GlobalNotFound() {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body className="grid min-h-dvh place-items-center bg-page p-6 font-sans text-ink antialiased" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: THEME_GUARD }} />
        <main className="max-w-md text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">404</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Page not found</h1>
          <p className="mt-3 text-ink-muted">The page you are looking for does not exist.</p>
          <p className="mt-6 flex justify-center gap-3">
            <Link className="rounded-control bg-primary px-4 py-2.5 font-semibold text-on-primary" href="/en">
              IMEI-HUB
            </Link>
          </p>
        </main>
      </body>
    </html>
  );
}
