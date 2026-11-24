import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The links read the current address from the router; the test says which page is open.
const location = vi.hoisted(() => ({ pathname: "/en/account/settings" }));
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname }));

import { capabilitiesOf } from "@/lib/account/capabilities";
import { account } from "@/lib/i18n/messages/account";
import { SettingsNav } from "./settings-nav";

const t = account.settings;
const labels = {
  navLabel: t.navLabel,
  navTitle: t.navTitle,
  sections: {
    profile: t.nav.profile,
    security: t.nav.security,
    notifications: t.nav.notifications,
    "api-keys": t.nav.apiKeys,
    privacy: t.nav.privacy,
  },
};

const render = (kind: "retail" | "merchant", pathname: string) => {
  location.pathname = pathname;
  return renderToStaticMarkup(<SettingsNav caps={capabilitiesOf({ rank: { kind }, hasPassword: true })} labels={labels} />);
};

const links = (html: string) =>
  [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(?:<svg.*?<\/svg>)?([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);

describe("SettingsNav: one navigation for every rank", () => {
  it("a retail rank is offered Profile, Security and Privacy, on the pages of the one account area", () => {
    expect(links(render("retail", "/en/account/settings"))).toEqual([
      ["/en/account/settings", "Profile"],
      ["/en/account/settings/security", "Security"],
      ["/en/account/settings/privacy", "Privacy"],
    ]);
  });

  it("a merchant rank is also offered Notifications and API keys, and no link goes under the old portal", () => {
    const html = render("merchant", "/en/account/settings");
    expect(links(html).map(([, label]) => label)).toEqual(["Profile", "Security", "Notifications", "API keys", "Privacy"]);
    expect(html).not.toContain("/merchant");
  });

  it("marks the open page, and only that one", () => {
    const html = render("merchant", "/en/account/settings/api-keys");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>(?:<svg.*?<\/svg>)?API keys/);
  });

  it("the profile is current on its own address only, not on the pages below it", () => {
    expect(render("retail", "/en/account/settings").match(/aria-current="page"/g)).toHaveLength(1);
    expect(render("retail", "/en/account/settings/privacy")).not.toMatch(/aria-current="page"[^>]*>(?:<svg.*?<\/svg>)?Profile/);
  });

  it("names the navigation for assistive technology", () => {
    expect(render("retail", "/en/account/settings")).toContain(`aria-label="${t.navLabel}"`);
  });
});
