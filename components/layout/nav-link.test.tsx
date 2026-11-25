import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The client parts read the URL from next/navigation: a stand-in that answers what a page would.
const url = vi.hoisted(() => ({ pathname: "/en/services" as string | null, search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => url.pathname,
  useSearchParams: () => new URLSearchParams(url.search),
}));

import { NavLink } from "./nav-link";

const TYPES = ["imei", "server", "file", "remote"] as const;

/** The header's catalog links and "Track an order", as the nav row renders them. */
function links() {
  return (
    <nav>
      <NavLink href="/en/services" exceptParam={{ name: "type", oneOf: TYPES }}>
        All
      </NavLink>
      {TYPES.map((type) => (
        <NavLink key={type} href={`/en/services?type=${type}`} param={{ name: "type", is: type }}>
          {type}
        </NavLink>
      ))}
      <NavLink href="/en/track">Track</NavLink>
    </nav>
  );
}

/** The texts of the links marked `aria-current="page"`. */
function marked(pathname: string, search: string): string[] {
  url.pathname = pathname;
  url.search = search;
  const html = renderToStaticMarkup(links());
  return [...html.matchAll(/<a [^>]*aria-current="page"[^>]*>([^<]*)<\/a>/g)].map((match) => match[1]);
}

describe("NavLink with a rule on a query parameter", () => {
  beforeEach(() => {
    url.pathname = "/en/services";
    url.search = "";
  });

  it("marks exactly one link of the catalog's five", () => {
    expect(marked("/en/services", "")).toEqual(["All"]);
    expect(marked("/en/services", "type=imei")).toEqual(["imei"]);
    expect(marked("/en/services", "type=remote")).toEqual(["remote"]);
    expect(marked("/en/services", "type=imei&type=server")).toEqual(["All"]);
    expect(marked("/en/services/some-service", "type=imei")).toEqual(["All"]);
    expect(marked("/en/track", "type=imei")).toEqual(["Track"]);
    expect(marked("/en", "")).toEqual([]);
  });

  it("keeps the rule out of the markup", () => {
    url.search = "type=file";
    const html = renderToStaticMarkup(links());
    expect(html).not.toMatch(/param|oneOf|exceptParam/i);
    expect(html).toContain('href="/en/services?type=file"');
  });
});
