import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceNavView, type WorkspaceNavItem } from "./workspace-nav-view";

const items: WorkspaceNavItem[] = [
  { href: "/en/account", label: "Overview", icon: <i data-icon="overview" />, match: "exact" },
  { href: "/en/account/orders", label: "Orders", icon: <i data-icon="orders" /> },
  { href: "/en/account/wallet", label: "Wallet", icon: <i data-icon="wallet" />, reserve: true },
  { href: "/en/account/notifications", label: "Notifications", icon: <i data-icon="bell" /> },
];

describe("WorkspaceNavView: a reserved item (plan P1.4)", () => {
  for (const variant of ["rail", "drawer"] as const) {
    it(`${variant}: holds its place as an empty slot hidden from assistive technology, with no link, label or icon`, () => {
      const html = renderToStaticMarkup(<WorkspaceNavView items={items} pathname={null} variant={variant} />);
      expect(html).not.toContain("/en/account/wallet");
      expect(html).not.toContain("Wallet");
      expect(html).not.toContain('data-icon="wallet"');
      // Four `li`: three links and the slot, in the item's own position (between Orders and Notifications).
      expect(html.match(/<li[ >]/g)).toHaveLength(4);
      expect(html).toMatch(/<li aria-hidden="true"><span class="block [^"]*"><\/span><\/li>/);
      expect(html.indexOf("Orders")).toBeLessThan(html.indexOf('aria-hidden="true"><span class="block'));
      expect(html.indexOf('aria-hidden="true"><span class="block')).toBeLessThan(html.indexOf("Notifications"));
    });

    it(`${variant}: the same list without \`reserve\` shows the item as a link`, () => {
      const shown = items.map((item) => ({ ...item, reserve: undefined }));
      const html = renderToStaticMarkup(<WorkspaceNavView items={shown} pathname={null} variant={variant} />);
      expect(html).toContain('href="/en/account/wallet"');
      expect(html).toContain("Wallet");
      expect(html).not.toContain('aria-hidden="true"><span class="block');
    });
  }

  it("marks the page the pathname is on and nothing when the pathname is unknown", () => {
    const on = renderToStaticMarkup(<WorkspaceNavView items={items} pathname="/en/account/orders" variant="drawer" />);
    expect(on.match(/aria-current="page"/g)).toHaveLength(1);
    expect(on).toMatch(/aria-current="page"[^>]*>(<i data-icon="orders"><\/i>)Orders/);
    const none = renderToStaticMarkup(<WorkspaceNavView items={items} pathname={null} variant="drawer" />);
    expect(none).not.toContain("aria-current");
  });
});
