import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The gate reads the pathname and the router from next/navigation: a stand-in that answers what a page would.
const nav = vi.hoisted(() => ({ pathname: "/en/account", replace: () => {} }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ replace: nav.replace }) }));

import { securityPageHref } from "@/lib/account/nav";
import { MUST_CHANGE_ANCHOR, MustChangePasswordGate, mustChangeDecision, mustChangeHref } from "./must-change-password-gate";

const SECURITY = "/en/account/settings/security";

describe("mustChangeDecision: what the gate does on a page of the account", () => {
  it("does nothing when the account has no temporary password, on any page", () => {
    for (const pathname of ["/en/account", SECURITY, "/en/account/orders"]) {
      expect(mustChangeDecision({ mustChange: false, pathname, securityPath: SECURITY })).toBe("none");
    }
  });

  it("sends an account with the flag from any other page of the account to the security page", () => {
    for (const pathname of ["/en/account", "/en/account/orders", "/en/account/settings", "/en/account/settings/notifications", "/en/account/wallet"]) {
      expect(mustChangeDecision({ mustChange: true, pathname, securityPath: SECURITY })).toBe("redirect");
    }
  });

  it("lets the account stay on the security page (warning only), so there is no redirect loop", () => {
    expect(mustChangeDecision({ mustChange: true, pathname: SECURITY, securityPath: SECURITY })).toBe("warn");
    expect(mustChangeDecision({ mustChange: true, pathname: `${SECURITY}/`, securityPath: SECURITY })).toBe("warn");
  });

  it("a page that merely starts like the security page is another page", () => {
    expect(mustChangeDecision({ mustChange: true, pathname: `${SECURITY}-help`, securityPath: SECURITY })).toBe("redirect");
    expect(mustChangeDecision({ mustChange: true, pathname: `${SECURITY}/extra`, securityPath: SECURITY })).toBe("redirect");
  });

  it("an unknown pathname is treated as another page (the redirect is harmless on the security page itself)", () => {
    expect(mustChangeDecision({ mustChange: true, pathname: null, securityPath: SECURITY })).toBe("redirect");
  });
});

describe("mustChangeHref: where the redirect lands", () => {
  it("aims at the warning's own id, not the password card, so the warning is in view after the redirect", () => {
    expect(mustChangeHref(SECURITY)).toBe("/en/account/settings/security#must-change-password");
  });

  it("the frame points the gate at the one security page of the account, never at a retired portal address", () => {
    expect(securityPageHref()).toBe(SECURITY);
    expect(mustChangeHref(securityPageHref())).toBe("/en/account/settings/security#must-change-password");
    expect(securityPageHref()).not.toContain("/merchant");
  });
});

describe("MustChangePasswordGate: what is drawn", () => {
  const draw = (mustChange: boolean) =>
    renderToStaticMarkup(
      <MustChangePasswordGate
        mustChange={mustChange}
        securityPath={SECURITY}
        title="Choose a new password"
        text="Support gave you a temporary password."
      >
        <p>PAGE CONTENT</p>
      </MustChangePasswordGate>,
    );

  beforeEach(() => {
    nav.pathname = "/en/account";
  });

  it("no flag: only the page", () => {
    const html = draw(false);
    expect(html).toContain("PAGE CONTENT");
    expect(html).not.toContain("Choose a new password");
  });

  it("flag on another page: the warning, and the page's content is not drawn while the route is replaced", () => {
    const html = draw(true);
    expect(html).toContain("Choose a new password");
    expect(html).toContain("Support gave you a temporary password.");
    expect(html).toContain('role="alert"');
    expect(html).toContain(`id="${MUST_CHANGE_ANCHOR}"`);
    expect(html).not.toContain("PAGE CONTENT");
  });

  it("flag on the security page: the warning above the page", () => {
    nav.pathname = SECURITY;
    const html = draw(true);
    expect(html).toContain("Choose a new password");
    expect(html).toContain("PAGE CONTENT");
    expect(html).toContain(`id="${MUST_CHANGE_ANCHOR}"`);
    expect(html.indexOf("Choose a new password")).toBeLessThan(html.indexOf("PAGE CONTENT"));
  });
});
