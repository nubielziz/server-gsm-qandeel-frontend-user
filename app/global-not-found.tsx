// 404 for URLs that match no route at all (the root layout sits under [lang], so it cannot render these).
// Rare in practice: proxy.ts sends every path without a language to /en or /ar first.
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Page not found · GSM Store" };

export default function GlobalNotFound() {
  return (
    <html lang="en" dir="ltr">
      <body className="grid min-h-dvh place-items-center bg-page p-6 font-sans text-ink antialiased">
        <main className="max-w-md text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">404</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Page not found</h1>
          <p className="mt-3 text-ink-muted">
            The page you are looking for does not exist. · الصفحة التي تبحث عنها غير موجودة.
          </p>
          <p className="mt-6 flex justify-center gap-3">
            <a className="rounded-md bg-inverse px-4 py-2.5 font-semibold text-on-inverse" href="/en">
              GSM Store
            </a>
            <a className="rounded-md border border-line-strong bg-surface px-4 py-2.5 font-semibold" href="/ar" lang="ar">
              المتجر
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
