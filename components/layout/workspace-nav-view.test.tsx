import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { accountPageTitles, staticAccountNav, type AccountNavEntry } from "@/lib/account/nav";
import { activeItem, headingItems, WorkspaceNavView, type WorkspaceNavItem } from "./workspace-nav-view";

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

  it("shows the short label, puts the badge after the label (read after the name) and holds a reserved item's column", () => {
    const html = renderToStaticMarkup(<WorkspaceNavView items={tabs} pathname="/en/account/notifications" variant="tabs" />);
    expect(html).toContain(">Alerts</span>");
    expect(html).not.toContain(">Notifications<");
    expect(html).toMatch(
      /aria-current="page" class="tab-link [^"]*" href="\/en\/account\/notifications"><span class="tab-icon [^"]*"><i data-icon="bell"><\/i><\/span><span class="max-w-full truncate">Alerts<\/span><span class="absolute [^"]*"><b>2<\/b><\/span>/,
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

describe("headingItems and activeItem: the header title", () => {
  const withIcon = (entry: AccountNavEntry): WorkspaceNavItem => ({
    href: entry.href,
    label: entry.label,
    title: entry.title,
    match: entry.match,
    icon: <i data-icon={entry.id} />,
    badge: <b>3</b>,
  });
  const statics = staticAccountNav();
  const nav = statics.nav.map(withIcon);
  const footerNav = statics.footerNav.map(withIcon);

  it("hands the heading the four fields it reads and nothing else: no icon, no badge", () => {
    const items = headingItems(nav, footerNav);
    for (const item of items) expect(Object.keys(item).sort()).toEqual(["href", "label", "match", "title"]);
    expect(JSON.stringify(items)).not.toContain("data-icon");
  });

  it("puts the nav first, then the footer, then the pages that only name a title", () => {
    const items = headingItems(nav, footerNav, accountPageTitles());
    expect(items.map((item) => item.label)).toEqual([
      "Overview",
      "Orders",
      "Wallet",
      "Notifications",
      "Support",
      "Settings",
      "Invoices",
      "API keys",
    ]);
  });

  it("the deepest address wins, and the overview owns only its own page", () => {
    const items = headingItems(nav, footerNav, accountPageTitles());
    expect(activeItem(items, "/en/account")?.label).toBe("Overview");
    expect(activeItem(items, "/en/account/orders/42")?.label).toBe("Orders");
    expect(activeItem(items, "/en/account/settings")?.label).toBe("Settings");
    expect(activeItem(items, "/en/account/settings/security")?.label).toBe("Settings");
    expect(activeItem(items, "/en/account/settings/api-keys")?.label).toBe("API keys");
    expect(activeItem(items, "/en/account/support/new")?.label).toBe("Support");
  });

  it("a page nothing names, and an unknown pathname, have no active item", () => {
    const items = headingItems(nav, footerNav, accountPageTitles());
    expect(activeItem(items, "/en/services")).toBeUndefined();
    expect(activeItem(items, null)).toBeUndefined();
  });

  it("the static shell alone leaves a merchant rank's own pages without a title; the titles name them", () => {
    const staticOnly = headingItems(nav, footerNav);
    expect(activeItem(staticOnly, "/en/account/invoices/5")).toBeUndefined();
    const named = headingItems(nav, footerNav, accountPageTitles());
    expect(activeItem(named, "/en/account/invoices/5")?.label).toBe("Invoices");
    // The retired price list (decision 003) has no title any more: its old addresses only redirect.
    expect(activeItem(named, "/en/account/services/12")).toBeUndefined();
  });

  it("a title never replaces a nav item that has the same address", () => {
    const items = headingItems(nav, footerNav, [{ href: "/en/account/orders", label: "Other" }]);
    expect(activeItem(items, "/en/account/orders")?.label).toBe("Orders");
  });
});

describe("the frame names no kind of account", () => {
  const sources = ["workspace-shell.tsx", "workspace-nav.tsx", "workspace-nav-view.tsx"].map((file) =>
    readFileSync(path.join(__dirname, file), "utf8"),
  );

  it("has no customer or portal wording: one frame for every account", () => {
    for (const source of sources) {
      expect(source).not.toMatch(/\bcustomers?\b/i);
      expect(source).not.toMatch(/merchant (portal|account)/i);
    }
  });
});
