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

describe("WorkspaceNavView: the rail (owner, 2026-11-15)", () => {
  const badge = (
    <>
      <span aria-hidden="true" data-badge="">
        3
      </span>
      <span className="sr-only">, 3 unread</span>
    </>
  );
  const withBadge = items.map((item) => (item.href.endsWith("/notifications") ? { ...item, badge } : item));

  it("the tooltip repeats the label for the eye only; the sr-only label and the badge's words are the name", () => {
    const html = renderToStaticMarkup(<WorkspaceNavView items={withBadge} pathname="/en/account/orders" variant="rail" />);
    expect(html).toMatch(/<span aria-hidden="true" class="rail-tip">Orders<\/span>/);
    // Name: the sr-only label, then the badge's words, in that order inside the link.
    expect(html).toMatch(
      /href="\/en\/account\/notifications"[^>]*>.*<span class="sr-only">Notifications<\/span><span class="[^"]*"><span aria-hidden="true" data-badge="">3<\/span><span class="sr-only">, 3 unread<\/span><\/span>/,
    );
    // The badge lies over the icon's corner: absolute, so it moves nothing.
    expect(html).toMatch(/<span class="absolute [^"]*"><span aria-hidden="true" data-badge="">/);
  });

  it("marks the current link for the CSS-only selected look (the square and the edge mark) before the indicator takes over", () => {
    const html = renderToStaticMarkup(<WorkspaceNavView items={items} pathname="/en/account/orders" variant="rail" />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/<a aria-current="page" class="rail-link [^"]*" href="\/en\/account\/orders">/);
    expect(html.match(/class="rail-mark"/g)).toHaveLength(3); // one per link, shown by CSS on the current one
  });
});

describe("WorkspaceNavView: the phone tab bar", () => {
  const tabs: WorkspaceNavItem[] = [
    { href: "/en/account", label: "Overview", icon: <i data-icon="overview" />, match: "exact" },
    { href: "/en/account/notifications", label: "Notifications", shortLabel: "Alerts", icon: <i data-icon="bell" />, badge: <b>2</b> },
    { href: "/en/account/wallet", label: "Wallet", icon: <i data-icon="wallet" />, reserve: true },
  ];

  it("shows the short label, puts the badge on the icon pill and holds a reserved item's column", () => {
    const html = renderToStaticMarkup(<WorkspaceNavView items={tabs} pathname="/en/account/notifications" variant="tabs" />);
    expect(html).toContain(">Alerts</span>");
    expect(html).not.toContain(">Notifications<");
    expect(html).toMatch(
      /aria-current="page" class="tab-link [^"]*" href="\/en\/account\/notifications"><span class="tab-icon [^"]*"><i data-icon="bell"><\/i><span class="absolute [^"]*"><b>2<\/b><\/span><\/span>/,
    );
    expect(html.match(/<li[ >]/g)).toHaveLength(3);
    expect(html).not.toContain("/en/account/wallet");
    expect(html).toMatch(/<li aria-hidden="true"><span class="block [^"]*"><\/span><\/li>/);
  });

  it("every tab is a full-height column: a touch target of at least 44px", () => {
    const html = renderToStaticMarkup(<WorkspaceNavView items={tabs} pathname={null} variant="tabs" />);
    for (const match of html.matchAll(/class="(tab-link [^"]*)"/g)) expect(match[1]).toContain("h-(--ws-tabbar-h)");
    expect(html).toContain("auto-cols-fr grid-flow-col");
  });
});
