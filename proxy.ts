// Runs before every page request (never for /client, /store/v1, Next internals or files):
// 1. Language routing: every page lives under /en or /ar. A path without a language (an emailed link such as
//    /sign-in?token=… or /merchant/set-password?token=…, a bookmark, a typed URL) is redirected to the visitor's
//    language, keeping the query string.
// 2. Optimistic sign-in check for the private areas: without the surface's readable CSRF cookie no session can exist,
//    so /account… and the merchant portal redirect to sign-in at once. This is only a fast path: every page still
//    asks the API who is signed in (lib/api/session.ts), which is the real check.
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n/config";

// Merchant pages that must stay public (email links and sign-up), relative to /<lang>/merchant.
const PUBLIC_MERCHANT_PAGES = new Set(["/register", "/set-password", "/verify-email"]);

function preferredLocale(request: NextRequest): Locale {
  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  // Accept-Language: take the first supported language in the listed order (q-values are sorted by browsers).
  const header = request.headers.get("accept-language") ?? "";
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase() ?? "";
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

function signInRedirect(request: NextRequest, locale: Locale, as: "merchant" | "customer"): NextResponse {
  const url = request.nextUrl.clone();
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.pathname = `/${locale}/sign-in`;
  url.search = new URLSearchParams({ as, next }).toString();
  return NextResponse.redirect(url);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const segments = pathname.split("/");
  const first = segments[1];

  if (!isLocale(first)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${preferredLocale(request)}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }

  const area = segments[2];
  if (area === "account" && !request.cookies.has("csrf_token_store")) {
    return signInRedirect(request, first, "customer");
  }
  if (area === "merchant") {
    const rest = `/${segments.slice(3).join("/")}`.replace(/\/+$/, "") || "/";
    if (!PUBLIC_MERCHANT_PAGES.has(rest) && !request.cookies.has("csrf_token_client")) {
      return signInRedirect(request, first, "merchant");
    }
  }
  return NextResponse.next();
}

export const config = {
  // Skip the API surfaces proxied to the backend, Next internals, metadata files and any path with a file extension.
  matcher: ["/((?!client/|store/v1/|_next/|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.[a-zA-Z0-9]+$).*)"],
};
