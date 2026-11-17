import { describe, expect, it } from "vitest";
import { SITE_PREFIX, sitePath } from "./site-path";

describe("sitePath", () => {
  it("prefixes a path with /en", () => {
    expect(SITE_PREFIX).toBe("/en");
    expect(sitePath("/services")).toBe("/en/services");
    expect(sitePath("/account/orders?page=2")).toBe("/en/account/orders?page=2");
  });
  it("adds the leading slash and answers the home page for no path", () => {
    expect(sitePath("help")).toBe("/en/help");
    expect(sitePath("/")).toBe("/en");
    expect(sitePath()).toBe("/en");
  });
});
