// Server markup of the link tabs (owner, 2026-11-15): the current tab draws its own look before hydration, the sliding
// indicator is the nav's own element (never an attribute on a link), and every page with tabs animates its list.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TabPanel, Tabs, type TabItem } from "./tabs";

const items: TabItem[] = [
  { key: "all", label: "All", href: "/en/account/orders" },
  { key: "pending", label: "Pending", href: "/en/account/orders?status=pending", count: 3 },
  { key: "completed", label: "Completed", href: "/en/account/orders?status=completed" },
];

describe("Tabs: server markup", () => {
  it("is a labelled nav whose current tab is marked, with its own underline until the indicator takes over", () => {
    const html = renderToStaticMarkup(<Tabs label="Order status" items={items} activeKey="pending" />);
    expect(html).toMatch(/^<nav aria-label="Order status" data-tabs="[^"]+" class="tabs relative tabs-underline overflow-x-auto border-b border-line">/);
    // Not placed yet: the CSS draws the current tab's own underline (no `data-indicator` in the server HTML).
    expect(html).not.toContain("data-indicator");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/<a aria-current="page" class="tabs-link [^"]*" href="\/en\/account\/orders\?status=pending">Pending/);
    expect(html.match(/class="tabs-mark /g)).toHaveLength(3);
    expect(html).toContain('<span class="tabs-count num');
  });

  it("draws one indicator, hidden from assistive technology, first in the nav, in three pieces", () => {
    const html = renderToStaticMarkup(<Tabs label="Order status" items={items} activeKey="all" />);
    expect(html).toMatch(
      /<span aria-hidden="true" class="tabs-indicator"><span class="tabs-cap-start"><\/span><span class="tabs-middle"><\/span><span class="tabs-cap-end"><\/span><\/span><ul/,
    );
    expect(html.match(/tabs-indicator/g)).toHaveLength(1);
  });

  it("the pill variant draws no underline marks and no covered-text rule on the server", () => {
    const html = renderToStaticMarkup(<Tabs label="Order status" items={items} activeKey="all" variant="pill" />);
    expect(html).toContain("tabs relative tabs-pill");
    expect(html).not.toContain("tabs-mark");
    expect(html).not.toContain("<style");
  });

  it("puts no attribute on the links for the motion: the direction travels as a transition type, not markup", () => {
    const html = renderToStaticMarkup(<Tabs label="Order status" items={items} activeKey="pending" />);
    expect(html).not.toContain("transition");
    expect(html).not.toContain("data-tab-");
  });
});

describe("TabPanel", () => {
  it("renders its one child as is", () => {
    const html = renderToStaticMarkup(
      <TabPanel activeKey="pending">
        <div id="list">rows</div>
      </TabPanel>,
    );
    expect(html).toBe('<div id="list">rows</div>');
  });
});

// Every page with link tabs moves its list on a tab click (owner, 2026-11-15): it wraps the list in <TabPanel> with the
// same key as the tabs. The design kit only shows the tab row.
describe("every page with link tabs wraps its list in <TabPanel>", () => {
  const ROOT = path.join(__dirname, "../..");
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return files(full);
      return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [full] : [];
    });
  const users = [...files(path.join(ROOT, "app")), ...files(path.join(ROOT, "components"))].filter((file) => {
    const source = readFileSync(file, "utf8");
    return source.includes('from "@/components/ui/tabs"') && !file.includes(`${path.sep}ui-kit${path.sep}`);
  });

  it("finds the pages", () => {
    expect(users.length).toBeGreaterThanOrEqual(7);
  });

  for (const file of users) {
    it(path.relative(ROOT, file), () => {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("<TabPanel activeKey=");
    });
  }
});
