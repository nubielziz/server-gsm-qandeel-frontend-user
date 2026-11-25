import { describe, expect, it } from "vitest";
import { isActiveLink, isActivePath, type ActiveRule } from "./active-path";

const CATALOG = "/en/services";
const TYPES = ["imei", "server", "file", "remote"] as const;

/** The rules of the header's catalog links (components/layout/store-header.tsx), in the row's order. */
const ALL: ActiveRule = { exceptParam: { name: "type", oneOf: TYPES } };
const LINKS = [
  { label: "All services", href: CATALOG, rule: ALL },
  ...TYPES.map((type) => ({ label: type, href: `${CATALOG}?type=${type}`, rule: { param: { name: "type", is: type } } satisfies ActiveRule })),
];

const query = (search: string) => new URLSearchParams(search);

/** The labels of the links that would carry `aria-current="page"` at a URL. */
function current(pathname: string, search: string): string[] {
  return LINKS.filter((link) => isActiveLink(pathname, query(search), link.href, "prefix", link.rule)).map((link) => link.label);
}

describe("isActivePath", () => {
  it("is the page and everything below it for prefix, the page only for exact; the query of href is ignored", () => {
    expect(isActivePath("/en/services", "/en/services")).toBe(true);
    expect(isActivePath("/en/services/some-service", "/en/services")).toBe(true);
    expect(isActivePath("/en/services/some-service", "/en/services", "exact")).toBe(false);
    expect(isActivePath("/en/services", "/en/services?type=imei", "exact")).toBe(true);
    expect(isActivePath("/en/servicesx", "/en/services")).toBe(false);
    expect(isActivePath(null, "/en/services")).toBe(false);
  });
});

describe("isActiveLink without a rule", () => {
  it("is isActivePath, whatever the query says", () => {
    expect(isActiveLink("/en/track", query("type=imei"), "/en/track")).toBe(true);
    expect(isActiveLink("/en/help/article", query(""), "/en/help")).toBe(true);
    expect(isActiveLink("/en/help/article", query(""), "/en/help", "exact")).toBe(false);
    expect(isActiveLink("/en/support", null, "/en/help")).toBe(false);
    expect(isActiveLink(null, null, "/en/help")).toBe(false);
  });
});

describe("the catalog links: exactly one is current", () => {
  it("no type: only All services", () => {
    expect(current(CATALOG, "")).toEqual(["All services"]);
    expect(current(CATALOG, "stock=1&sort=price")).toEqual(["All services"]);
  });

  it("one type: only that type's link, whatever else the query holds or the order of it", () => {
    for (const type of TYPES) expect(current(CATALOG, `type=${type}`)).toEqual([type]);
    expect(current(CATALOG, "stock=1&type=server&brand=apple")).toEqual(["server"]);
    expect(current(CATALOG, "page=2&type=file")).toEqual(["file"]);
  });

  it("two types chosen in the sidebar: All services, no type link", () => {
    expect(current(CATALOG, "type=imei&type=server")).toEqual(["All services"]);
    expect(current(CATALOG, "type=remote&type=file&type=imei")).toEqual(["All services"]);
    expect(current(CATALOG, "type=imei&type=imei")).toEqual(["All services"]);
  });

  it("a type value no link carries (unknown, empty, another case): All services", () => {
    expect(current(CATALOG, "type=other")).toEqual(["All services"]);
    expect(current(CATALOG, "type=")).toEqual(["All services"]);
    expect(current(CATALOG, "type=IMEI")).toEqual(["All services"]);
    expect(current(CATALOG, "type=imei&type=other")).toEqual(["All services"]);
  });

  it("a service page under /services: All services, never a type link, even with a type in the query", () => {
    expect(current("/en/services/atandt-usa-premier-unlock", "")).toEqual(["All services"]);
    expect(current("/en/services/atandt-usa-premier-unlock", "type=imei")).toEqual(["All services"]);
  });

  it("a trailing slash is the same page", () => {
    expect(current("/en/services/", "")).toEqual(["All services"]);
    expect(current("/en/services/", "type=server")).toEqual(["server"]);
    expect(current("/en/services/", "type=server&type=file")).toEqual(["All services"]);
  });

  it("another page: none of them (the query of another page is not the catalog's)", () => {
    for (const pathname of ["/en", "/en/track", "/en/help/how-it-works", "/en/servicesx", "/en/account/services"]) {
      expect(current(pathname, ""), pathname).toEqual([]);
      expect(current(pathname, "type=imei"), pathname).toEqual([]);
    }
    expect(isActiveLink(null, query("type=imei"), CATALOG, "prefix", ALL)).toBe(false);
  });

  it("no query known (null): the catalog is All services", () => {
    expect(isActiveLink(CATALOG, null, CATALOG, "prefix", ALL)).toBe(true);
    expect(isActiveLink(CATALOG, null, `${CATALOG}?type=imei`, "prefix", { param: { name: "type", is: "imei" } })).toBe(false);
  });
});

describe("the rule is about the named parameter only", () => {
  it("another parameter with the same value changes nothing", () => {
    expect(current(CATALOG, "brand=imei")).toEqual(["All services"]);
    expect(isActiveLink(CATALOG, query("kind=a"), "/en/x", "prefix", { param: { name: "kind", is: "a" } })).toBe(false);
    expect(isActiveLink("/en/x", query("kind=a"), "/en/x", "prefix", { param: { name: "kind", is: "a" } })).toBe(true);
  });

  it("a param rule never matches below the page, even with match=prefix", () => {
    expect(isActiveLink("/en/services/a", query("type=imei"), CATALOG, "prefix", { param: { name: "type", is: "imei" } })).toBe(false);
  });
});
