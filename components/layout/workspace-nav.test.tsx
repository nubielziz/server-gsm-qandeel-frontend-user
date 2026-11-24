import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The client parts read the pathname from next/navigation: a stand-in that answers what a page would.
const nav = vi.hoisted(() => ({ pathname: "/en/account" as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { accountPageTitles, staticAccountNav } from "@/lib/account/nav";
import { WorkspaceHeading, WorkspaceHeadingView } from "./workspace-nav";
import { headingItems, activeItem, type WorkspaceNavItem } from "./workspace-nav-view";

const area = { areaLabel: "My account", areaHref: "/en/account", breadcrumbLabel: "Breadcrumb" };

describe("WorkspaceHeadingView: the breadcrumb and the title", () => {
  it("names the area and the page; the title is the page's own title when it has one", () => {
    const html = renderToStaticMarkup(
      <WorkspaceHeadingView
        {...area}
        active={{ href: "/en/account/services", label: "Price list", title: "Services & prices" }}
      />,
    );
    expect(html).toContain(
      '<a class="touch-target rounded-badge hover:text-ink hover:underline" href="/en/account">My account</a>',
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain(">Price list<");
    expect(html).toContain(">Services &amp; prices</p>");
  });

  it("the title is the label when the page has no title of its own", () => {
    const html = renderToStaticMarkup(
      <WorkspaceHeadingView {...area} active={{ href: "/en/account/orders", label: "Orders" }} />,
    );
    expect(html).toContain(">Orders</p>");
  });

  it("with no active page only the area is named and the title keeps its height", () => {
    const html = renderToStaticMarkup(<WorkspaceHeadingView {...area} />);
    expect(html).toContain(">My account<");
    expect(html).toContain("min-h-7");
    expect(html).not.toContain("/en/account/orders");
  });
});

describe("WorkspaceHeading: the title of the page the browser is on", () => {
  const withIcon = (items: ReturnType<typeof staticAccountNav>["nav"]): WorkspaceNavItem[] =>
    items.map((entry) => ({ href: entry.href, label: entry.label, title: entry.title, match: entry.match, icon: <i /> }));
  const statics = staticAccountNav();
  const items = headingItems(withIcon(statics.nav), withIcon(statics.footerNav), accountPageTitles());

  beforeEach(() => {
    nav.pathname = "/en/account";
  });

  it("a page of the static list is titled from it", () => {
    nav.pathname = "/en/account/orders/7";
    const html = renderToStaticMarkup(<WorkspaceHeading items={items} {...area} />);
    expect(html).toContain(">Orders</p>");
  });

  it("a page only a merchant rank has is titled from the titles", () => {
    nav.pathname = "/en/account/invoices/12";
    const html = renderToStaticMarkup(<WorkspaceHeading items={items} {...area} />);
    expect(html).toContain(">Invoices</p>");
    expect(activeItem(items, nav.pathname)?.label).toBe("Invoices");
  });

  it("an unknown pathname names only the area", () => {
    nav.pathname = null;
    const html = renderToStaticMarkup(<WorkspaceHeading items={items} {...area} />);
    expect(html).toContain(">My account<");
    expect(html).not.toContain("Orders");
  });
});
