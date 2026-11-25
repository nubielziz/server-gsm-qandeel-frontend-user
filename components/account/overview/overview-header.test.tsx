// The top of the overview (components/account/overview/overview-header.tsx): the greeting, the rank beside it, the actions.
import Link from "next/link";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AccountMe } from "@/lib/api/types";
import { OverviewHeader, RankChip } from "./overview-header";

const account = (kind: "retail" | "merchant", over: Partial<AccountMe> = {}): AccountMe => ({
  id: 5,
  name: "Daniel Whitmore",
  email: "d@example.test",
  status: "active",
  rank: { id: 1, name: kind === "retail" ? "Retail" : "Gold merchant", kind, discountPercent: "0.0000" },
  hasPassword: true,
  mustChangePassword: false,
  twofaEnabled: false,
  currency: null,
  marketingOptIn: false,
  company: "",
  username: "",
  phone: "",
  country: "",
  address: "",
  taxId: "",
  emailVerifiedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("RankChip", () => {
  it("shows the name of the rank", () => {
    expect(renderToStaticMarkup(<RankChip me={account("retail")} />)).toContain("Retail");
    expect(renderToStaticMarkup(<RankChip me={account("merchant")} />)).toContain("Gold merchant");
  });

  it("draws a merchant rank as a solid chip and a retail one as a quiet one", () => {
    expect(renderToStaticMarkup(<RankChip me={account("merchant")} />)).toContain("bg-primary");
    expect(renderToStaticMarkup(<RankChip me={account("retail")} />)).not.toContain("bg-primary");
  });
});

describe("OverviewHeader", () => {
  it("holds the greeting as the page's one heading, with the rank and the actions", () => {
    const html = renderToStaticMarkup(
      <OverviewHeader
        me={account("merchant")}
        description="Your services"
        actions={<Link href="/en/account/services">New order</Link>}
      />,
    );
    expect(html).toMatch(/<h1[^>]*>Welcome back, Daniel Whitmore<\/h1>/);
    expect(html).toContain("Gold merchant");
    expect(html).toContain("Your services");
    expect(html).toContain('href="/en/account/services"');
    expect(html.match(/<h1/g)).toHaveLength(1);
  });
});
