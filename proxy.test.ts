// The proxy has two jobs: send a path that is not under /en to /en, and send a visitor with no account cookie from the
// account area to sign-in. It knows no portal address: next.config.ts answers every old one before the proxy runs.
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

/** A request for a path (with its query) on the site, with the given cookies and extra headers. */
function request(path: string, cookies: Record<string, string> = {}, headers: Record<string, string> = {}): NextRequest {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest(new URL(path, "http://localhost:5175"), { headers: cookie ? { ...headers, cookie } : headers });
}

/** Where a redirect answer leads, as a path with its query, or null when the answer is not a redirect. */
function redirectedTo(response: Response): string | null {
  if (response.status !== 307) return null;
  const to = new URL(response.headers.get("location") ?? "", "http://localhost:5175");
  return `${to.pathname}${to.search}`;
}

/** A proxy answer that lets the request go on to the page. */
function passes(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1" && !response.headers.has("location");
}

describe("the account area asks for an account cookie", () => {
  it("sends a visitor with no cookie to sign-in, with the page as next and no kind", () => {
    const response = proxy(request("/en/account/orders"));
    expect(redirectedTo(response)).toBe("/en/sign-in?next=%2Fen%2Faccount%2Forders");
    const to = new URL(response.headers.get("location") ?? "");
    expect([...to.searchParams.keys()]).toEqual(["next"]);
  });

  it("keeps the query of the page inside next", () => {
    const response = proxy(request("/en/account/orders?status=open&page=2"));
    const to = new URL(response.headers.get("location") ?? "");
    expect(to.pathname).toBe("/en/sign-in");
    expect(to.searchParams.get("next")).toBe("/en/account/orders?status=open&page=2");
  });

  it("guards the overview and every page under it", () => {
    for (const path of [
      "/en/account",
      "/en/account/support/new",
      "/en/account/settings/security",
      "/en/account/wallet/add-funds",
    ]) {
      expect(redirectedTo(proxy(request(path))), path).toBe(`/en/sign-in?next=${encodeURIComponent(path)}`);
    }
  });

  it("lets the request pass with the cookie of either family", () => {
    for (const name of ["csrf_token_client", "csrf_token_store"]) {
      expect(passes(proxy(request("/en/account/orders", { [name]: "t" }))), name).toBe(true);
    }
  });

  it("lets the request pass with both cookies", () => {
    expect(passes(proxy(request("/en/account", { csrf_token_client: "a", csrf_token_store: "b" })))).toBe(true);
  });

  it("does not take another cookie for an account cookie", () => {
    const others: Record<string, string>[] = [{ csrf_token: "t" }, { session: "s" }, { csrf_token_staff: "t" }];
    for (const cookies of others) {
      expect(redirectedTo(proxy(request("/en/account", cookies))), JSON.stringify(cookies)).toBe(
        "/en/sign-in?next=%2Fen%2Faccount",
      );
    }
  });

  it("leaves every other page of the site open, and a path that only starts with the same letters", () => {
    for (const path of [
      "/en",
      "/en/services",
      "/en/sign-in",
      "/en/set-password?token=t",
      "/en/become-a-merchant",
      "/en/track/t_abc",
      "/en/accounting",
    ]) {
      expect(passes(proxy(request(path))), path).toBe(true);
    }
  });

  it("knows no portal address: an old one passes (the redirects of next.config.ts answer it before the proxy)", () => {
    for (const path of ["/en/merchant", "/en/merchant/orders", "/en/merchant/register", "/en/merchant/set-password?token=t"]) {
      expect(passes(proxy(request(path))), path).toBe(true);
    }
  });
});

describe("every page lives under /en", () => {
  it("sends a path outside /en to the same path under /en, with its query", () => {
    const cases: [string, string][] = [
      ["/", "/en"],
      ["/sign-in?token=t", "/en/sign-in?token=t"],
      ["/set-password?token=xyz", "/en/set-password?token=xyz"],
      ["/support/tickets/t_abc", "/en/support/tickets/t_abc"],
      ["/services/imei-unlock?currency=EUR", "/en/services/imei-unlock?currency=EUR"],
      ["/enx/page", "/en/enx/page"],
    ];
    for (const [from, to] of cases) expect(redirectedTo(proxy(request(from))), from).toBe(to);
  });

  it("reads no cookie and no Accept-Language to decide", () => {
    const cookies = { csrf_token_client: "t", csrf_token_store: "t", locale: "xx" };
    const headers = { "accept-language": "fr-FR,fr;q=0.9" };
    expect(redirectedTo(proxy(request("/sign-in?token=t", cookies, headers)))).toBe("/en/sign-in?token=t");
    expect(redirectedTo(proxy(request("/", {}, headers)))).toBe("/en");
  });

  it("asks nothing of a path outside /en before it is moved (the account check runs on the moved request)", () => {
    expect(redirectedTo(proxy(request("/account/orders")))).toBe("/en/account/orders");
  });
});

describe("the matcher", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it("covers the pages of the site", () => {
    for (const path of ["/", "/en", "/en/account/orders", "/sign-in", "/en/services/some-service"]) {
      expect(matcher.test(path), path).toBe(true);
    }
  });

  it("skips the API surfaces, Next internals, metadata files and paths with a file extension", () => {
    const skipped = [
      "/client/auth/me",
      "/client/orders",
      "/store/v1/me",
      "/store/v1/config",
      "/_next/static/chunks/app.js",
      "/favicon.ico",
      "/robots.txt",
      "/sitemap.xml",
      "/images/logo.png",
      "/en/opengraph-image.png",
    ];
    for (const path of skipped) expect(matcher.test(path), path).toBe(false);
  });
});
