// The retired merchant Webhooks pages: every old address under them answers a permanent redirect to the API keys page,
// with and without the /en prefix, before any sign-in check (next.config.ts redirects run before proxy.ts).
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

type Redirect = { source: string; destination: string; permanent?: boolean };

async function redirects(): Promise<Redirect[]> {
  const rules = await nextConfig.redirects?.();
  return (rules ?? []) as Redirect[];
}

/** The source pattern as a RegExp, for the one shape used here: `/a/b/:name*` (zero or more trailing segments). */
function matcher(source: string): RegExp {
  const pattern = source.replace(/\/:[A-Za-z]+\*$/, "(?:/.*)?");
  return new RegExp(`^${pattern}$`);
}

describe("retired merchant Webhooks pages", () => {
  it("send the list and the delivery log of an endpoint to the API keys page, with and without /en", async () => {
    const rules = (await redirects()).filter((rule) => rule.destination === "/en/merchant/api-keys");
    expect(rules.map((rule) => rule.source).sort()).toEqual(["/en/merchant/webhooks/:path*", "/merchant/webhooks/:path*"]);
    for (const rule of rules) expect(rule.permanent).toBe(true);

    for (const path of ["/en/merchant/webhooks", "/en/merchant/webhooks/12", "/merchant/webhooks", "/merchant/webhooks/12"]) {
      expect(rules.some((rule) => matcher(rule.source).test(path)), path).toBe(true);
    }
  });

  it("leave the API keys page and other merchant pages alone", async () => {
    const rules = (await redirects()).filter((rule) => rule.destination === "/en/merchant/api-keys");
    for (const path of ["/en/merchant/api-keys", "/en/merchant/webhooks-extra", "/en/merchant/orders", "/en/merchant/settings"]) {
      expect(rules.some((rule) => matcher(rule.source).test(path)), path).toBe(false);
    }
  });
});
