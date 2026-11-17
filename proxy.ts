// Runs before every page request (never for /client, /store/v1, Next internals or files):
// 1. Every page lives under /en, the site's one language (decision 039). A path that does not start with /en (an
//    emailed link such as /sign-in?token=… or /merchant/set-password?token=…, a bookmark, a typed URL) is redirected to
//    the same path under /en, keeping the query string. No cookie or Accept-Language is read. An old Arabic address
//    never reaches this file: next.config.ts answers it first with a permanent redirect to /en.
// 2. Optimistic sign-in check for the private areas: without the surface's readable CSRF cookie no session can exist,
//    so /account… and the merchant portal redirect to sign-in at once. This is only a fast path: every page still
//    asks the API who is signed in (lib/api/session.ts), which is the real check.
import { NextResponse, type NextRequest } from "next/server";
import { localePath } from "@/lib/i18n/config";

// Merchant pages that must stay public (email links and sign-up), relative to /en/merchant.
const PUBLIC_MERCHANT_PAGES = new Set(["/register", "/set-password", "/verify-email"]);

function signInRedirect(request: NextRequest, as: "merchant" | "customer"): NextResponse {
  const url = request.nextUrl.clone();
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.pathname = localePath("en", "/sign-in");
  url.search = new URLSearchParams({ as, next }).toString();
  return NextResponse.redirect(url);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const segments = pathname.split("/");

  if (segments[1] !== "en") {
    const url = request.nextUrl.clone();
    url.pathname = localePath("en", pathname);
    return NextResponse.redirect(url);
  }

  const area = segments[2];
  if (area === "account" && !request.cookies.has("csrf_token_store")) {
    return signInRedirect(request, "customer");
  }
  if (area === "merchant") {
    const rest = `/${segments.slice(3).join("/")}`.replace(/\/+$/, "") || "/";
    if (!PUBLIC_MERCHANT_PAGES.has(rest) && !request.cookies.has("csrf_token_client")) {
      return signInRedirect(request, "merchant");
    }
  }
  return NextResponse.next();
}

export const config = {
  // Skip the API surfaces proxied to the backend, Next internals, metadata files and any path with a file extension.
  matcher: ["/((?!client/|store/v1/|_next/|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.[a-zA-Z0-9]+$).*)"],
};
