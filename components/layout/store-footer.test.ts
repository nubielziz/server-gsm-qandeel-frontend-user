// The footer's link columns: one merchants link that explains how a merchant account is opened, and no link to a merchant area.
import { describe, expect, it } from "vitest";
import { sitePath } from "@/lib/site-path";
import { footerColumns } from "./store-footer";

describe("footerColumns", () => {
  const columns = footerColumns(sitePath);
  const links = columns.flatMap((column) => column.links);

  it("the merchants column has one link, to the page that explains how a merchant account is opened", () => {
    const merchants = columns.find((column) => column.title === "Merchants");
    expect(merchants?.links).toEqual([{ href: "/en/become-a-merchant", label: "Become a merchant" }]);
  });

  it("no link goes to a merchant area, and none says merchant portal", () => {
    for (const link of links) {
      expect(link.href, link.label).not.toContain("/merchant");
      expect(link.label).not.toMatch(/portal/i);
    }
  });

  it("every other column keeps its links", () => {
    expect(links.map((link) => link.href)).toEqual(
      expect.arrayContaining(["/en/services", "/en/track", "/en/help", "/en/support", "/en/pages/terms", "/en/pages/privacy"]),
    );
  });
});
