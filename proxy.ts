// Runs before every page request (never for /client, /store/v1, Next internals or files):
// 1. Every page lives under /en, the site's one language (decision 039). A path that does not start with /en (an
//    emailed link such as /sign-in?token=…, a bookmark, a typed URL) is redirected to the same path under /en, keeping the
//    query string. No cookie or Accept-Language is read. An old Arabic address never reaches this file: next.config.ts
//    answers it first with a permanent redirect to /en. It answers every old portal address (the pages under /merchant
//    and the old ticket list) the same way, so this file knows no portal address.
// 2. Optimistic sign-in check for the account area: an account has one of two readable CSRF cookies (the name follows the
//    family of its rank), and without either of them no session can exist, so /account… redirects to sign-in at once. This is
//    only a fast path: every page still asks the API who is signed in (lib/api/session.ts), which is the real check.
import { NextResponse, type NextRequest } from "next/server";
import { hasAccountCookie } from "@/lib/api/account-cookie";
import { sitePath } from "@/lib/site-path";

function signInRedirect(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.pathname = sitePath("/sign-in");
  url.search = new URLSearchParams({ next }).toString();
  return NextResponse.redirect(url);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const segments = pathname.split("/");

  if (segments[1] !== "en") {
    const url = request.nextUrl.clone();
    url.pathname = sitePath(pathname);
    return NextResponse.redirect(url);
  }

  if (segments[2] === "account" && !hasAccountCookie((name) => request.cookies.has(name))) {
    return signInRedirect(request);
  }
  return NextResponse.next();
}

export const config = {
  // Skip the API surfaces proxied to the backend, Next internals, metadata files and any path with a file extension.
  matcher: ["/((?!client/|store/v1/|_next/|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.[a-zA-Z0-9]+$).*)"],
};
