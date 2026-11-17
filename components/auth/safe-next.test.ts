import { describe, expect, it } from "vitest";
import { safeNext, targetAfterSignIn } from "./safe-next";

describe("safeNext", () => {
  const fallback = "/en/account";

  it("keeps a path that starts with a supported language", () => {
    expect(safeNext("/en/account/orders", fallback)).toBe("/en/account/orders");
    expect(safeNext("/en/checkout?service=x#top", fallback)).toBe("/en/checkout?service=x#top");
    expect(safeNext("/en", fallback)).toBe("/en");
  });

  it("reads an old Arabic address as the same path under /en (decision 039), then checks it as usual", () => {
    expect(safeNext("/ar/account/orders", fallback)).toBe("/en/account/orders");
    expect(safeNext("/ar/checkout?service=x#top", fallback)).toBe("/en/checkout?service=x#top");
    expect(safeNext("/ar", fallback)).toBe("/en");
    expect(safeNext("/ar?x=1", fallback)).toBe("/en?x=1");
    for (const raw of ["/arabic/account", "/ar\\evil.test", "/ar/account\nSet-Cookie: a=b", "/arx/account"]) {
      expect(safeNext(raw, fallback), raw).toBe(fallback);
    }
  });

  it("falls back for anything that leaves the site or has no language", () => {
    for (const raw of [
      null,
      undefined,
      "",
      "https://evil.test/en/account",
      "//evil.test/en/account",
      "/\\evil.test",
      "/en\\..\\x",
      "/en/account\nSet-Cookie: a=b",
      "/fr/account",
      "/enx/account",
      "javascript:alert(1)",
      "/account",
      `/en/${"a".repeat(2100)}`,
    ]) {
      expect(safeNext(raw, fallback)).toBe(fallback);
    }
  });
});

describe("targetAfterSignIn", () => {
  it("sends a customer who came from a portal link to the account, not the portal", () => {
    expect(targetAfterSignIn("customer", "/en/merchant/orders", "en")).toBe("/en/account");
    expect(targetAfterSignIn("customer", "/en/merchant", "en")).toBe("/en/account");
    expect(targetAfterSignIn("customer", "/en/merchant/settings?tab=1", "en")).toBe("/en/account");
  });

  it("keeps a portal path for a merchant", () => {
    expect(targetAfterSignIn("merchant", "/en/merchant/orders", "en")).toBe("/en/merchant/orders");
    expect(targetAfterSignIn("merchant", "/en/merchant/settings?tab=security#password", "en")).toBe("/en/merchant/settings?tab=security#password");
  });

  it("sends a merchant who came from an account link to the portal", () => {
    expect(targetAfterSignIn("merchant", "/en/account/orders", "en")).toBe("/en/merchant");
    expect(targetAfterSignIn("merchant", "/en/account", "en")).toBe("/en/merchant");
  });

  it("keeps a customer's own account path", () => {
    expect(targetAfterSignIn("customer", "/en/account/orders", "en")).toBe("/en/account/orders");
  });

  it("keeps any other same-site path for both kinds", () => {
    expect(targetAfterSignIn("customer", "/en/checkout?service=x", "en")).toBe("/en/checkout?service=x");
    expect(targetAfterSignIn("merchant", "/en/checkout?service=x", "en")).toBe("/en/checkout?service=x");
    expect(targetAfterSignIn("customer", "/en/services/foo", "en")).toBe("/en/services/foo");
    // A path that only starts with the same letters is not the portal.
    expect(targetAfterSignIn("customer", "/en/merchants-guide", "en")).toBe("/en/merchants-guide");
  });

  it("falls back to the home of the kind for an unsafe or missing next", () => {
    for (const next of [null, undefined, "", "https://evil.test/en/account", "//evil.test", "/account", "/en\\x", "javascript:alert(1)"]) {
      expect(targetAfterSignIn("customer", next, "en")).toBe("/en/account");
      expect(targetAfterSignIn("merchant", next, "en")).toBe("/en/merchant");
    }
  });

  it("applies the area rules to an old Arabic address after reading it under /en", () => {
    expect(targetAfterSignIn("customer", "/ar/merchant/orders", "en")).toBe("/en/account");
    expect(targetAfterSignIn("merchant", "/ar/merchant/orders", "en")).toBe("/en/merchant/orders");
    expect(targetAfterSignIn("merchant", "/ar/account", "en")).toBe("/en/merchant");
    expect(targetAfterSignIn("customer", "/ar/account/orders?page=2", "en")).toBe("/en/account/orders?page=2");
    // A dot segment that resolves under /ar is the /en area the browser would end in.
    expect(targetAfterSignIn("customer", "/en/x/../../ar/merchant", "en")).toBe("/en/account");
    expect(targetAfterSignIn("merchant", "/en/x/../../ar/account", "en")).toBe("/en/merchant");
  });

  it("is not fooled by dot segments or percent escapes that resolve into the other area", () => {
    expect(targetAfterSignIn("customer", "/en/x/../merchant/orders", "en")).toBe("/en/account");
    expect(targetAfterSignIn("customer", "/en/%6Derchant/orders", "en")).toBe("/en/account");
    expect(targetAfterSignIn("customer", "/en/%2e%2e/en/merchant", "en")).toBe("/en/account");
    expect(targetAfterSignIn("merchant", "/en/x/../account", "en")).toBe("/en/merchant");
    expect(targetAfterSignIn("merchant", "/en/%61ccount/orders", "en")).toBe("/en/merchant");
    // An escape that cannot be decoded is not trusted.
    expect(targetAfterSignIn("customer", "/en/%E0%A4%A", "en")).toBe("/en/account");
  });
});
