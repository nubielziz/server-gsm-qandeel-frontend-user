import { describe, expect, it } from "vitest";
import { MAX_LINK_LENGTH, notificationHref, UNREAD_CAP, unreadText, unreadTextInline } from "./link";

describe("notificationHref: what is refused", () => {
  const refused = [
    ["a protocol-relative URL", "//evil.test"],
    ["an absolute URL", "https://x.example/account"],
    ["a scheme", "javascript:alert(1)"],
    ["a data URL", "data:text/html,<b>x</b>"],
    ["a backslash after the slash", "/\\evil.test"],
    ["a backslash inside the path", "/account\\orders"],
    ["a newline", "/account/orders\n"],
    ["a tab", "/account\t/orders"],
    ["a NUL", "/account/\u0000orders"],
    ["a DEL", "/account/\u007forders"],
    ["a relative path", "account/orders"],
    ["a protocol-relative URL behind a language", "/en//evil.test"],
    ["a dot segment", "/account/../merchant/orders"],
    ["an encoded dot segment", "/account/%2e%2e/orders"],
    ["a single dot segment", "/account/./orders"],
    ["an empty string", ""],
  ] as const;

  for (const [name, link] of refused) {
    it(`refuses ${name}`, () => {
      expect(notificationHref(link, "en", "customer")).toBeNull();
      expect(notificationHref(link, "ar", "merchant")).toBeNull();
    });
  }

  it("refuses a path of 201 characters and accepts one of 200", () => {
    const filler = (n: number) => `/${"a".repeat(n - 1)}`;
    expect(notificationHref(filler(MAX_LINK_LENGTH + 1), "en", "customer")).toBeNull();
    expect(notificationHref(filler(MAX_LINK_LENGTH), "en", "customer")).toBe(`/en${filler(MAX_LINK_LENGTH)}`);
  });

  it("renders no link for null, undefined or a value that is not text", () => {
    expect(notificationHref(null, "en", "customer")).toBeNull();
    expect(notificationHref(undefined, "en", "customer")).toBeNull();
    expect(notificationHref(42 as unknown as string, "en", "customer")).toBeNull();
  });
});

describe("notificationHref: the language prefix", () => {
  it("prefixes a path with the page's language", () => {
    expect(notificationHref("/account/orders", "ar", "customer")).toBe("/ar/account/orders");
    expect(notificationHref("/account/orders", "en", "customer")).toBe("/en/account/orders");
    expect(notificationHref("/", "ar", "customer")).toBe("/ar");
  });

  it("keeps the query string and the fragment", () => {
    expect(notificationHref("/account/orders?status=pending#top", "en", "customer")).toBe("/en/account/orders?status=pending#top");
  });

  it("keeps a path that already starts with /en or /ar", () => {
    expect(notificationHref("/en/account", "ar", "customer")).toBe("/en/account");
    expect(notificationHref("/ar/account", "en", "customer")).toBe("/ar/account");
    expect(notificationHref("/en", "ar", "customer")).toBe("/en");
    expect(notificationHref("/en?x=1", "ar", "customer")).toBe("/en?x=1");
  });

  it("does not take a longer first segment for a language", () => {
    expect(notificationHref("/english", "ar", "customer")).toBe("/ar/english");
    expect(notificationHref("/arabic/news", "en", "customer")).toBe("/en/arabic/news");
  });
});

describe("notificationHref: the merchant area", () => {
  it("accepts /merchant and everything below it", () => {
    expect(notificationHref("/merchant", "en", "merchant")).toBe("/en/merchant");
    expect(notificationHref("/merchant/settings/notifications", "ar", "merchant")).toBe("/ar/merchant/settings/notifications");
    expect(notificationHref("/merchant/orders?page=2", "en", "merchant")).toBe("/en/merchant/orders?page=2");
    expect(notificationHref("/merchant#top", "en", "merchant")).toBe("/en/merchant#top");
  });

  it("accepts a language-prefixed merchant path as it is", () => {
    expect(notificationHref("/en/merchant/orders", "ar", "merchant")).toBe("/en/merchant/orders");
  });

  it("refuses a customer path and look-alikes", () => {
    expect(notificationHref("/account/orders", "en", "merchant")).toBeNull();
    expect(notificationHref("/en/account", "en", "merchant")).toBeNull();
    expect(notificationHref("/merchantx", "en", "merchant")).toBeNull();
    expect(notificationHref("/merchants/orders", "en", "merchant")).toBeNull();
    expect(notificationHref("/services", "en", "merchant")).toBeNull();
    expect(notificationHref("/en", "en", "merchant")).toBeNull();
  });

  it("does not let a dot segment leave /merchant", () => {
    expect(notificationHref("/merchant/../account/orders", "en", "merchant")).toBeNull();
  });
});

describe("notificationHref: the customer area", () => {
  it("accepts any site path", () => {
    expect(notificationHref("/track/abc_DEF-123", "en", "customer")).toBe("/en/track/abc_DEF-123");
    expect(notificationHref("/services/unlock", "ar", "customer")).toBe("/ar/services/unlock");
  });
});

describe("unreadText", () => {
  it("writes 99+ at the API's cap of 100", () => {
    expect(UNREAD_CAP).toBe(100);
    expect(unreadText(100, "en")).toBe("99+");
    expect(unreadText(100, "ar")).toBe("99+");
    expect(unreadText(250, "en")).toBe("99+");
  });

  it("writes the number below the cap, with Latin digits in Arabic", () => {
    expect(unreadText(0, "en")).toBe("0");
    expect(unreadText(1, "en")).toBe("1");
    expect(unreadText(99, "en")).toBe("99");
    expect(unreadText(99, "ar")).toBe("99");
  });

  it("keeps 99+ one left-to-right unit inside running text, and leaves plain numbers alone", () => {
    expect(unreadTextInline(100, "ar")).toBe("\u206699+\u2069");
    expect(unreadTextInline(100, "en")).toBe("\u206699+\u2069");
    expect(unreadTextInline(7, "ar")).toBe("7");
    expect(unreadTextInline(99, "ar")).toBe("99");
  });
});
