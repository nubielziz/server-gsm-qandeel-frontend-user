import { describe, expect, it } from "vitest";
import { LEGACY_PATHS, legacyAccountPath } from "./legacy-paths";

/** Every page the old portal, the old ticket list and the retired extras had, written as the patterns of the table. */
const OLD_PAGES = [
  "/merchant",
  "/merchant/services",
  "/merchant/services/:id",
  "/merchant/orders",
  "/merchant/orders/:id",
  "/merchant/wallet",
  "/merchant/wallet/top-up",
  "/merchant/invoices",
  "/merchant/invoices/:id",
  "/merchant/api-keys",
  "/merchant/webhooks/:path*",
  "/merchant/referrals",
  "/merchant/notifications",
  "/merchant/support",
  "/merchant/support/new",
  "/merchant/support/:id",
  "/merchant/settings",
  "/merchant/settings/security",
  "/merchant/settings/notifications",
  "/merchant/settings/verification",
  "/merchant/set-password",
  "/merchant/verify-email",
  "/merchant/register",
  "/account/tickets",
  "/account/tickets/new",
];

/** A concrete address for a pattern: a value for the parameter, nothing for the open tail. */
const sample = (pattern: string) => pattern.replace(/\/:[A-Za-z]+\*$/, "").replace(/:[A-Za-z]+/g, "42");

describe("LEGACY_PATHS: the table", () => {
  it("has a row for every old page", () => {
    for (const page of OLD_PAGES) {
      expect(
        LEGACY_PATHS.some((row) => row.from === page),
        page,
      ).toBe(true);
    }
  });

  it("has no row that is not an old page, so the list above stays the whole table", () => {
    expect(LEGACY_PATHS.map((row) => row.from).sort()).toEqual([...OLD_PAGES, "/merchant/:path*"].sort());
  });

  it("has no two rows with the same source", () => {
    const sources = LEGACY_PATHS.map((row) => row.from);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it("never sends an address to another old address", () => {
    const sources = new Set(LEGACY_PATHS.map((row) => row.from));
    for (const row of LEGACY_PATHS) {
      expect(sources.has(row.to), row.to).toBe(false);
      expect(legacyAccountPath(sample(row.to)), row.to).toBeNull();
    }
  });

  it("writes every address without a language prefix and as a path of the site", () => {
    for (const row of LEGACY_PATHS) {
      for (const address of [row.from, row.to]) {
        expect(address.startsWith("/"), address).toBe(true);
        expect(address.startsWith("//"), address).toBe(false);
        expect(address.startsWith("/en/") || address === "/en", address).toBe(false);
      }
    }
  });

  it("uses in a target only the parameters its source has", () => {
    for (const row of LEGACY_PATHS) {
      const known = new Set([...row.from.matchAll(/:([A-Za-z]+)/g)].map((match) => match[1]));
      for (const match of row.to.matchAll(/:([A-Za-z]+)/g)) expect(known.has(match[1]), `${row.from} -> ${row.to}`).toBe(true);
    }
  });

  it("puts a fixed last segment before the parameter that would also match it, and the catch-all last", () => {
    const parentOf = (from: string) => from.slice(0, from.lastIndexOf("/"));
    const lastOf = (from: string) => from.slice(from.lastIndexOf("/") + 1);
    LEGACY_PATHS.forEach((row, index) => {
      if (!/^:[A-Za-z]+$/.test(lastOf(row.from))) return;
      const later = LEGACY_PATHS.slice(index + 1).filter(
        (other) => parentOf(other.from) === parentOf(row.from) && !lastOf(other.from).startsWith(":"),
      );
      expect(
        later.map((other) => other.from),
        row.from,
      ).toEqual([]);
    });
    expect(LEGACY_PATHS[LEGACY_PATHS.length - 1].from).toBe("/merchant/:path*");
    expect(LEGACY_PATHS.findIndex((row) => row.from === "/merchant/support/new")).toBeLessThan(
      LEGACY_PATHS.findIndex((row) => row.from === "/merchant/support/:id"),
    );
  });
});

describe("legacyAccountPath: where each old page goes", () => {
  const cases: [string, string][] = [
    ["/merchant", "/account"],
    ["/merchant/services", "/account/services"],
    ["/merchant/services/9", "/account/services/9"],
    ["/merchant/orders", "/account/orders"],
    ["/merchant/orders/42", "/account/orders/42"],
    ["/merchant/wallet", "/account/wallet"],
    ["/merchant/wallet/top-up", "/account/wallet/add-funds"],
    ["/merchant/invoices", "/account/invoices"],
    ["/merchant/invoices/17", "/account/invoices/17"],
    ["/merchant/api-keys", "/account/settings/api-keys"],
    ["/merchant/webhooks", "/account/settings/api-keys"],
    ["/merchant/webhooks/12", "/account/settings/api-keys"],
    ["/merchant/webhooks/12/deliveries", "/account/settings/api-keys"],
    ["/merchant/referrals", "/account"],
    ["/merchant/notifications", "/account/notifications"],
    ["/merchant/support", "/account/support"],
    ["/merchant/support/new", "/account/support/new"],
    ["/merchant/support/5", "/account/support/5"],
    ["/merchant/settings", "/account/settings"],
    ["/merchant/settings/security", "/account/settings/security"],
    ["/merchant/settings/notifications", "/account/settings/notifications"],
    ["/merchant/settings/verification", "/account/settings"],
    ["/merchant/set-password", "/set-password"],
    ["/merchant/verify-email", "/verify-email"],
    ["/merchant/register", "/become-a-merchant"],
    ["/account/tickets", "/account/support"],
    ["/account/tickets/new", "/account/support/new"],
  ];

  for (const [from, to] of cases) {
    it(`sends ${from} to ${to}, with and without the language prefix`, () => {
      expect(legacyAccountPath(from)).toBe(to);
      expect(legacyAccountPath(`/en${from}`)).toBe(to);
    });
  }

  it("reaches the new support page from the new-ticket address, not by the parameter row", () => {
    expect(legacyAccountPath("/merchant/support/new")).toBe("/account/support/new");
    expect(legacyAccountPath("/en/merchant/support/new?order=7")).toBe("/account/support/new?order=7");
  });
});

describe("legacyAccountPath: what travels with the address", () => {
  it("keeps the query", () => {
    expect(legacyAccountPath("/merchant/orders/42?x=1")).toBe("/account/orders/42?x=1");
    expect(legacyAccountPath("/en/merchant/orders/42?x=1&y=two")).toBe("/account/orders/42?x=1&y=two");
    expect(legacyAccountPath("/merchant/set-password?token=abc")).toBe("/set-password?token=abc");
    expect(legacyAccountPath("/merchant/orders?status=open")).toBe("/account/orders?status=open");
  });

  it("keeps the fragment", () => {
    expect(legacyAccountPath("/merchant/settings/security#must-change-password")).toBe(
      "/account/settings/security#must-change-password",
    );
    expect(legacyAccountPath("/merchant/orders/42?x=1#top")).toBe("/account/orders/42?x=1#top");
  });

  it("ignores one trailing slash", () => {
    expect(legacyAccountPath("/merchant/orders/")).toBe("/account/orders");
    expect(legacyAccountPath("/en/merchant/orders/42/")).toBe("/account/orders/42");
  });

  it("copies the id as it was written", () => {
    expect(legacyAccountPath("/merchant/orders/ab-12_c")).toBe("/account/orders/ab-12_c");
    expect(legacyAccountPath("/merchant/orders/a%20b")).toBe("/account/orders/a%20b");
  });
});

describe("legacyAccountPath: an unknown old address", () => {
  it("ends at the overview", () => {
    expect(legacyAccountPath("/merchant/x")).toBe("/account");
    expect(legacyAccountPath("/en/merchant/x")).toBe("/account");
    expect(legacyAccountPath("/merchant/x/y/z")).toBe("/account");
    expect(legacyAccountPath("/merchant/orders/42/refund")).toBe("/account");
  });

  it("keeps the query on the way to the overview", () => {
    expect(legacyAccountPath("/merchant/x?token=abc")).toBe("/account?token=abc");
  });
});

describe("legacyAccountPath: an address that is not an old one", () => {
  it("gives null", () => {
    const current = [
      "/",
      "/en",
      "/en/",
      "/account",
      "/en/account",
      "/account/orders",
      "/en/account/orders/42",
      "/account/support",
      "/account/settings/api-keys",
      "/services",
      "/en/services/imei-unlock",
      "/sign-in?token=abc",
      "/set-password",
      "/become-a-merchant",
      "/merchants",
      "/merchantx/orders",
      "/enmerchant/orders",
      "/en/en/merchant",
      "/account/tickets/42",
      "/client/orders",
      "/store/v1/me",
    ];
    for (const path of current) expect(legacyAccountPath(path), path).toBeNull();
  });

  it("gives null for text that is not a plain in-site path", () => {
    const refused = [
      "",
      "merchant/orders",
      "//evil.example/merchant",
      "///merchant",
      "https://evil.example/merchant/orders",
      "javascript:alert(1)",
      "/\\evil.example",
      "/merchant\\orders",
      "/merchant/orders\n",
      "/merchant/or\tders",
      "/merchant/\u0000orders",
      "/merchant/\u007forders",
    ];
    for (const path of refused) expect(legacyAccountPath(path), JSON.stringify(path)).toBeNull();
    expect(legacyAccountPath(undefined as unknown as string)).toBeNull();
    expect(legacyAccountPath(42 as unknown as string)).toBeNull();
  });

  it("never gives a result that leaves the site", () => {
    const hostile = [
      "/merchant/orders/..",
      "/merchant/orders/.",
      "/merchant/orders/%2e%2e",
      "/merchant/orders/%2E%2E",
      "/merchant/orders/%2Fevil.example",
      "/merchant/orders/%5Cevil.example",
      "/merchant/orders/%",
      "/merchant//evil.example",
      "/merchant/orders//evil.example",
      "/en/merchant/support/..",
    ];
    for (const path of hostile) {
      const result = legacyAccountPath(path);
      expect(result, path).not.toBeNull();
      expect(result!.startsWith("/account"), path).toBe(true);
      expect(result!.startsWith("//"), path).toBe(false);
      expect(result, path).not.toMatch(/\.\.|%2e|\\/i);
    }
  });

  it("sends a dot segment in place of an id to the overview", () => {
    expect(legacyAccountPath("/merchant/orders/..")).toBe("/account");
    expect(legacyAccountPath("/merchant/support/%2e%2e")).toBe("/account");
  });
});
