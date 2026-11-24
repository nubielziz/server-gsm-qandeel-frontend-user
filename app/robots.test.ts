// robots.txt: the private areas are disallowed, and an old address that only answers a redirect is not, so a crawler can see where it
// went. No page of the site lives under /merchant any more (lib/app-routes.test.ts), so the file names no such address.
import { describe, expect, it } from "vitest";
import robots from "./robots";

const rule = () => {
  const rules = robots().rules;
  const first = Array.isArray(rules) ? rules[0] : rules;
  return { allow: first.allow, disallow: ([] as string[]).concat(first.disallow ?? []) };
};

describe("robots.txt", () => {
  it("keeps the account area, the checkout and the sign-in pages out of search", () => {
    const { disallow } = rule();
    for (const path of ["/*/account", "/*/checkout", "/*/track/", "/*/sign-in", "/*/sign-up", "/client/", "/store/"]) {
      expect(disallow, path).toContain(path);
    }
  });

  it("does not name /merchant: nothing is served there but a redirect to the account area", () => {
    expect(rule().disallow.filter((path) => path.includes("merchant"))).toEqual([]);
  });
});
