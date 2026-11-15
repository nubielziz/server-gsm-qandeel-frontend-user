import { describe, expect, it } from "vitest";
import { alternatePath, languageSwitchTarget } from "./language-switcher";

const ORIGIN = "http://localhost:5175";

describe("alternatePath: the page's hreflang link, when the switcher may follow it", () => {
  it("takes the path of an absolute link of this origin", () => {
    expect(alternatePath(`${ORIGIN}/ar/services/fahs-icloud`, ORIGIN, "ar")).toBe("/ar/services/fahs-icloud");
    expect(alternatePath(`${ORIGIN}/en/services/icloud-clean-lost-check`, ORIGIN, "en")).toBe("/en/services/icloud-clean-lost-check");
  });

  it("takes a root-relative link too, and keeps percent-encoded Arabic slugs as they are", () => {
    expect(alternatePath("/ar/services/x", ORIGIN, "ar")).toBe("/ar/services/x");
    expect(alternatePath(`${ORIGIN}/ar/services/${encodeURIComponent("فحص")}`, ORIGIN, "ar")).toBe(`/ar/services/${encodeURIComponent("فحص")}`);
  });

  it("drops the query and the hash of the link (the switcher keeps the current page's own query)", () => {
    expect(alternatePath(`${ORIGIN}/ar/services/x?a=1#top`, ORIGIN, "ar")).toBe("/ar/services/x");
  });

  it("refuses another origin: the link may not take the visitor off this site", () => {
    expect(alternatePath("https://evil.example/ar/services/x", ORIGIN, "ar")).toBeNull();
    expect(alternatePath("http://localhost:5176/ar/services/x", ORIGIN, "ar")).toBeNull();
    expect(alternatePath("//evil.example/ar/services/x", ORIGIN, "ar")).toBeNull();
  });

  it("refuses a path that is not a page of the other language", () => {
    expect(alternatePath(`${ORIGIN}/en/services/x`, ORIGIN, "ar")).toBeNull();
    expect(alternatePath(`${ORIGIN}/arabic/services/x`, ORIGIN, "ar")).toBeNull();
    expect(alternatePath(`${ORIGIN}/services/x`, ORIGIN, "ar")).toBeNull();
  });

  it("refuses a missing or unreadable link", () => {
    expect(alternatePath(null, ORIGIN, "ar")).toBeNull();
    expect(alternatePath(undefined, ORIGIN, "ar")).toBeNull();
    expect(alternatePath("", ORIGIN, "ar")).toBeNull();
    expect(alternatePath("http://", ORIGIN, "ar")).toBeNull();
  });
});

describe("languageSwitchTarget", () => {
  it("swaps the language of the path and keeps the query when the page has no address of its own", () => {
    expect(languageSwitchTarget({ pathname: "/en/merchant/settings", search: "", other: "ar", alternate: null })).toBe("/ar/merchant/settings");
    expect(languageSwitchTarget({ pathname: "/en/services", search: "brand=apple&_start=24", other: "ar", alternate: null })).toBe(
      "/ar/services?brand=apple&_start=24",
    );
    expect(languageSwitchTarget({ pathname: "/ar/track", search: "", other: "en", alternate: null })).toBe("/en/track");
  });

  it("goes to the page's own address in the other language: a service page has another slug", () => {
    expect(
      languageSwitchTarget({ pathname: "/en/services/icloud-clean-lost-check", search: "", other: "ar", alternate: "/ar/services/fahs-icloud" }),
    ).toBe("/ar/services/fahs-icloud");
    expect(
      languageSwitchTarget({ pathname: "/ar/services/fahs-icloud", search: "", other: "en", alternate: "/en/services/icloud-clean-lost-check" }),
    ).toBe("/en/services/icloud-clean-lost-check");
  });

  it("keeps the page's query string on the page's own address", () => {
    expect(languageSwitchTarget({ pathname: "/en/services/a", search: "quantity=5", other: "ar", alternate: "/ar/services/b" })).toBe(
      "/ar/services/b?quantity=5",
    );
  });

  it("does not follow the root layout's generic alternate on a deep page: /ar is the home, not this page", () => {
    expect(languageSwitchTarget({ pathname: "/en/merchant/settings/security", search: "", other: "ar", alternate: "/ar" })).toBe(
      "/ar/merchant/settings/security",
    );
    expect(languageSwitchTarget({ pathname: "/en/checkout/abc", search: "x=1", other: "ar", alternate: "/ar/" })).toBe("/ar/checkout/abc?x=1");
  });

  it("the home page goes to the other home (the same answer from either source)", () => {
    expect(languageSwitchTarget({ pathname: "/en", search: "", other: "ar", alternate: "/ar" })).toBe("/ar");
    expect(languageSwitchTarget({ pathname: "/en", search: "", other: "ar", alternate: null })).toBe("/ar");
    expect(languageSwitchTarget({ pathname: "/ar/", search: "", other: "en", alternate: "/en/" })).toBe("/en/");
  });
});
