import { describe, expect, it } from "vitest";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { MAX_LINK_LENGTH, NOTIFICATION_API, NOTIFICATIONS_PAGE, notificationHref, UNREAD_CAP, unreadText } from "./link";

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
    ["a dot segment in an old portal address", "/merchant/../account/orders"],
    ["an empty string", ""],
  ] as const;

  for (const [name, link] of refused) {
    it(`refuses ${name}`, () => {
      expect(notificationHref(link)).toBeNull();
    });
  }

  it("refuses a path of 201 characters and accepts one of 200", () => {
    const filler = (n: number) => `/${"a".repeat(n - 1)}`;
    expect(notificationHref(filler(MAX_LINK_LENGTH + 1))).toBeNull();
    expect(notificationHref(filler(MAX_LINK_LENGTH))).toBe(`/en${filler(MAX_LINK_LENGTH)}`);
  });

  it("renders no link for null, undefined or a value that is not text", () => {
    expect(notificationHref(null)).toBeNull();
    expect(notificationHref(undefined)).toBeNull();
    expect(notificationHref(42 as unknown as string)).toBeNull();
  });
});

describe("notificationHref: the language prefix", () => {
  it("prefixes a path with /en", () => {
    expect(notificationHref("/account/orders")).toBe("/en/account/orders");
    expect(notificationHref("/")).toBe("/en");
  });

  it("keeps the query string and the fragment", () => {
    expect(notificationHref("/account/orders?status=pending#top")).toBe("/en/account/orders?status=pending#top");
  });

  it("keeps a path that already starts with /en", () => {
    expect(notificationHref("/en/account")).toBe("/en/account");
    expect(notificationHref("/en")).toBe("/en");
    expect(notificationHref("/en?x=1")).toBe("/en?x=1");
  });

  it("writes an old /ar address as the same path under /en (decision 039)", () => {
    expect(notificationHref("/ar/account/orders")).toBe("/en/account/orders");
    expect(notificationHref("/ar")).toBe("/en");
    expect(notificationHref("/ar?x=1#top")).toBe("/en?x=1#top");
    expect(notificationHref("/ar//evil.test")).toBeNull();
    expect(notificationHref("/ar/account/../orders")).toBeNull();
  });

  it("does not take a longer first segment for a language", () => {
    expect(notificationHref("/english")).toBe("/en/english");
    expect(notificationHref("/arabic/news")).toBe("/en/arabic/news");
  });
});

describe("notificationHref: one account area for every rank", () => {
  it("writes an old portal address as the account page that replaced it", () => {
    expect(notificationHref("/merchant/orders/5")).toBe("/en/account/orders/5");
    expect(notificationHref("/merchant")).toBe("/en/account");
    expect(notificationHref("/merchant/settings/notifications")).toBe("/en/account/settings/notifications");
    expect(notificationHref("/merchant/wallet/top-up")).toBe("/en/account/wallet/add-funds");
    expect(notificationHref("/merchant/support/42")).toBe("/en/account/support/42");
  });

  it("keeps the query string and the fragment of an old address", () => {
    expect(notificationHref("/merchant/orders?page=2")).toBe("/en/account/orders?page=2");
    expect(notificationHref("/merchant#top")).toBe("/en/account#top");
  });

  it("writes an old portal address behind a language the same way", () => {
    expect(notificationHref("/en/merchant/orders")).toBe("/en/account/orders");
    expect(notificationHref("/ar/merchant/orders/9")).toBe("/en/account/orders/9");
  });

  it("writes an old ticket list address as the support page", () => {
    expect(notificationHref("/account/tickets")).toBe("/en/account/support");
    expect(notificationHref("/account/tickets/new?order=7")).toBe("/en/account/support/new?order=7");
  });

  it("sends an unknown old portal address to the overview, never to a page that is gone", () => {
    expect(notificationHref("/merchant/referrals")).toBe("/en/account");
    expect(notificationHref("/merchant/nowhere/at/all")).toBe("/en/account");
  });

  it("accepts any safe site path whatever the rank, and leaves look-alikes of the old prefix alone", () => {
    expect(notificationHref("/track/abc_DEF-123")).toBe("/en/track/abc_DEF-123");
    expect(notificationHref("/services/unlock")).toBe("/en/services/unlock");
    expect(notificationHref("/account/orders/7")).toBe("/en/account/orders/7");
    expect(notificationHref("/merchantx")).toBe("/en/merchantx");
    expect(notificationHref("/merchants/orders")).toBe("/en/merchants/orders");
  });
});

describe("the inbox of each family", () => {
  it("takes its routes from the one route table", () => {
    expect(NOTIFICATION_API).toEqual({ store: "/store/v1/me/notifications", client: "/client/notifications" });
    expect(NOTIFICATION_API.store).toBe(FAMILY_ROUTES.store.notifications);
    expect(NOTIFICATION_API.client).toBe(FAMILY_ROUTES.client.notifications);
  });

  it("has one page for both families", () => {
    expect(NOTIFICATIONS_PAGE).toBe("/account/notifications");
  });
});

describe("unreadText", () => {
  it("writes 99+ at the API's cap of 100", () => {
    expect(UNREAD_CAP).toBe(100);
    expect(unreadText(100)).toBe("99+");
    expect(unreadText(250)).toBe("99+");
  });

  it("writes the number below the cap", () => {
    expect(unreadText(0)).toBe("0");
    expect(unreadText(1)).toBe("1");
    expect(unreadText(99)).toBe("99");
  });
});
