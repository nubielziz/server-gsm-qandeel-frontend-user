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

describe("targetAfterSignIn: one target rule for every account", () => {
  it("honours a path of the account area, whatever the rank of the account", () => {
    expect(targetAfterSignIn("/en/account/orders")).toBe("/en/account/orders");
    expect(targetAfterSignIn("/en/account/orders/7?tab=events#top")).toBe("/en/account/orders/7?tab=events#top");
    expect(targetAfterSignIn("/en/account/wallet/add-funds")).toBe("/en/account/wallet/add-funds");
  });

  it("writes an old portal address as the page that replaced it, with its query and fragment", () => {
    expect(targetAfterSignIn("/en/merchant/orders/7")).toBe("/en/account/orders/7");
    expect(targetAfterSignIn("/en/merchant/orders")).toBe("/en/account/orders");
    expect(targetAfterSignIn("/en/merchant")).toBe("/en/account");
    expect(targetAfterSignIn("/en/merchant/settings?tab=security#password")).toBe("/en/account/settings?tab=security#password");
    expect(targetAfterSignIn("/en/merchant/wallet/top-up")).toBe("/en/account/wallet/add-funds");
    expect(targetAfterSignIn("/en/merchant/api-keys")).toBe("/en/account/settings/api-keys");
    expect(targetAfterSignIn("/en/merchant/support/new?order=7")).toBe("/en/account/support/new?order=7");
  });

  it("writes the old ticket list as the support page, and any other old portal address as the account", () => {
    expect(targetAfterSignIn("/en/account/tickets")).toBe("/en/account/support");
    expect(targetAfterSignIn("/en/account/tickets/new")).toBe("/en/account/support/new");
    expect(targetAfterSignIn("/en/merchant/somewhere/else")).toBe("/en/account");
  });

  it("keeps any other same-site path as it is", () => {
    expect(targetAfterSignIn("/en/checkout?service=x")).toBe("/en/checkout?service=x");
    expect(targetAfterSignIn("/en/services/foo")).toBe("/en/services/foo");
    // A path that only starts with the same letters is not the old portal.
    expect(targetAfterSignIn("/en/merchants-guide")).toBe("/en/merchants-guide");
    expect(targetAfterSignIn("/en/become-a-merchant")).toBe("/en/become-a-merchant");
  });

  it("falls back to the account for an unsafe or missing next", () => {
    for (const next of [
      null,
      undefined,
      "",
      "https://evil.test/en/account",
      "//evil.test",
      "/account",
      "/en\\x",
      "javascript:alert(1)",
    ]) {
      expect(targetAfterSignIn(next), String(next)).toBe("/en/account");
    }
  });

  it("reads an old Arabic address under /en first, then applies the same rules", () => {
    expect(targetAfterSignIn("/ar/merchant/orders")).toBe("/en/account/orders");
    expect(targetAfterSignIn("/ar/account/orders?page=2")).toBe("/en/account/orders?page=2");
    expect(targetAfterSignIn("/ar/account")).toBe("/en/account");
    // A dot segment that resolves under /ar is the /en address the browser would end in.
    expect(targetAfterSignIn("/en/x/../../ar/merchant")).toBe("/en/account");
    expect(targetAfterSignIn("/en/x/../../ar/merchant/orders/3")).toBe("/en/account/orders/3");
  });

  it("is not fooled by dot segments or percent escapes that resolve into the old portal", () => {
    expect(targetAfterSignIn("/en/x/../merchant/orders")).toBe("/en/account/orders");
    expect(targetAfterSignIn("/en/%6Derchant/orders")).toBe("/en/account/orders");
    expect(targetAfterSignIn("/en/%2e%2e/en/merchant")).toBe("/en/account");
    expect(targetAfterSignIn("/en/merchant%2Forders/9")).toBe("/en/account/orders/9");
    // An escape that cannot be decoded is not trusted.
    expect(targetAfterSignIn("/en/%E0%A4%A")).toBe("/en/account");
  });

  it("never rewrites into another site: the result starts with one slash and the language", () => {
    for (const next of [
      "/en/merchant//evil.test",
      "/en/merchant/%2F%2Fevil.test",
      "/en/merchant/orders/..%2F..%2F",
      "/en/merchant/\\evil.test",
    ]) {
      const target = targetAfterSignIn(next);
      expect(target, next).toMatch(/^\/en(?:[/?#]|$)/);
      expect(target.startsWith("//"), next).toBe(false);
      expect(target.includes("\\"), next).toBe(false);
    }
  });
});
