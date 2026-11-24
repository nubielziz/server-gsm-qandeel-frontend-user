// The redirects of next.config.ts for the old portal and ticket addresses are built from LEGACY_PATHS: for each row an
// address with the language prefix and a bare one, both to the prefixed new address, in the order of the table. Next reads the
// rows in order and the first match wins, so these tests read them the same way (a small matcher for the two pattern
// shapes the table uses) and check that the config and `legacyAccountPath` send every address to the same place.
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { sitePath } from "@/lib/site-path";
import { LEGACY_PATHS, legacyAccountPath } from "./legacy-paths";

type Redirect = { source: string; destination: string; permanent?: boolean };

async function redirects(): Promise<Redirect[]> {
  return ((await nextConfig.redirects?.()) ?? []) as Redirect[];
}

/** A source pattern as a RegExp: `:name` is one segment, `:name*` is zero or more trailing segments (the table's two shapes). */
function compile(source: string): RegExp {
  const parts = source
    .split("/")
    .slice(1)
    .map((segment) => {
      if (/^:[A-Za-z]+\*$/.test(segment)) return "(?:/(.*))?";
      if (/^:[A-Za-z]+$/.test(segment)) return "/([^/]+)";
      return `/${segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
    });
  return new RegExp(`^${parts.join("")}$`);
}

/** The destination of the first rule that matches the path (names filled in), or null when no rule does. */
function firstRedirect(rules: Redirect[], path: string): string | null {
  for (const rule of rules) {
    const match = compile(rule.source).exec(path);
    if (!match) continue;
    const names = [...rule.source.matchAll(/:([A-Za-z]+)/g)].map((found) => found[1]);
    return rule.destination.replace(/:([A-Za-z]+)/g, (_, name: string) => match[names.indexOf(name) + 1] ?? "");
  }
  return null;
}

describe("the rows of next.config.ts", () => {
  it("start with the old-language row, then hold two rows for each row of the table, in its order", async () => {
    const rules = await redirects();
    expect(rules[0]).toEqual({
      source: expect.stringMatching(/^\/[a-z]{2}\/:path\*$/),
      destination: "/en/:path*",
      permanent: true,
    });
    expect(rules.slice(1)).toEqual(
      LEGACY_PATHS.flatMap((row) => [
        { source: `/en${row.from}`, destination: `/en${row.to}`, permanent: true },
        { source: row.from, destination: `/en${row.to}`, permanent: true },
      ]),
    );
  });

  it("hold nothing else, so no old row of the portal is left beside the table", async () => {
    const rules = await redirects();
    expect(rules).toHaveLength(1 + 2 * LEGACY_PATHS.length);
    expect(rules.filter((rule) => rule.destination.startsWith("/en/merchant"))).toEqual([]);
    const sources = rules.map((rule) => rule.source);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it("are all permanent (308) and name an address of the site as the target", async () => {
    for (const rule of await redirects()) {
      expect(rule.permanent, rule.source).toBe(true);
      expect(rule.destination.startsWith("/en"), rule.destination).toBe(true);
      expect(rule.destination.startsWith("//"), rule.destination).toBe(false);
    }
  });

  it("put the catch-all of the portal last, with its prefixed row first", async () => {
    const rules = await redirects();
    expect(rules.slice(-2).map((rule) => rule.source)).toEqual(["/en/merchant/:path*", "/merchant/:path*"]);
  });

  it("never send an address to another old portal address", async () => {
    const rules = await redirects();
    for (const row of LEGACY_PATHS) {
      const target = `/en${row.to.replace(/\/:[A-Za-z]+\*$/, "").replace(/:[A-Za-z]+/g, "42")}`;
      expect(firstRedirect(rules.slice(1), target), target).toBeNull();
    }
  });
});

describe("where an old address goes", () => {
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
    // Anything else under the old portal prefix ends at the overview.
    ["/merchant/x", "/account"],
    ["/merchant/x/y/z", "/account"],
    ["/merchant/orders/42/refund", "/account"],
    // The retired webhook pages end at the API keys page; a name that only starts like them does not.
    ["/merchant/webhooks-extra", "/account"],
  ];

  for (const [from, to] of cases) {
    it(`sends ${from} to ${sitePath(to)}, with and without the language prefix`, async () => {
      const rules = await redirects();
      expect(firstRedirect(rules, from)).toBe(sitePath(to));
      expect(firstRedirect(rules, `/en${from}`)).toBe(sitePath(to));
    });
  }

  it("agrees with legacyAccountPath for every address above", async () => {
    const rules = await redirects();
    for (const [from] of cases) {
      for (const address of [from, `/en${from}`]) {
        expect(firstRedirect(rules, address), address).toBe(sitePath(legacyAccountPath(address) ?? "?"));
      }
    }
  });
});

describe("what the redirects leave alone", () => {
  it("lets a current address through, so only an old one is moved", async () => {
    const rules = (await redirects()).slice(1);
    const current = [
      "/en",
      "/en/services",
      "/en/account",
      "/en/account/orders",
      "/en/account/orders/42",
      "/en/account/support",
      "/en/account/support/new",
      "/en/account/settings/api-keys",
      "/en/account/tickets/42",
      "/en/set-password",
      "/en/verify-email",
      "/en/become-a-merchant",
      "/en/merchants",
      "/en/merchantx/orders",
      "/account",
      "/account/orders",
      "/account/support",
      "/sign-in",
      "/become-a-merchant",
      "/client/auth/me",
      "/store/v1/me",
    ];
    for (const path of current) expect(firstRedirect(rules, path), path).toBeNull();
  });
});
