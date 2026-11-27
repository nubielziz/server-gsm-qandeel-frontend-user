// The cards of a merchant rank's overview (components/merchant/dashboard-widgets.tsx): every link goes into the account area.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MerchantDashboard } from "@/lib/api/types";
import { common } from "@/lib/i18n/messages/common";
import { merchant } from "@/lib/i18n/messages/merchant";
import { BalanceCard, HelpCard, OrderStats, RecentOrders } from "./dashboard-widgets";

const order = (id: number): MerchantDashboard["latestOrders"][number] => ({
  id,
  status: "completed",
  imei: "490154203237518",
  quantity: 1,
  inputs: {},
  unitPrice: "1.0000",
  totalPrice: "1.0000",
  currency: "USD",
  service: { id: 3, name: "Carrier check", type: "imei" },
  source: "portal",
  result: { code: null, comment: null, fileId: null },
  verificationStatus: null,
  inputFileId: null,
  canCancel: false,
  cancelUntil: null,
  cancelBlocked: "closed",
  canVerify: false,
  verifyUntil: null,
  verifyBlocked: "not_allowed",
  createdAt: "2026-11-01T10:00:00.000Z",
  completedAt: null,
});

const dashboard = (latestOrders: MerchantDashboard["latestOrders"] = []): MerchantDashboard => ({
  wallet: { balance: "10.0000", reserved: "2.0000", creditLimit: "5.0000", available: "13.0000" },
  counts: { pending: 1, processing: 2, completed: 3, rejected: 4 },
  openOrders: 3,
  latestOrders,
});

const props = (data: MerchantDashboard) => ({ data, t: merchant, c: common });
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);

describe("the balance card", () => {
  it("adds funds on the one add-funds page and lists the transactions on the one wallet page", () => {
    const html = renderToStaticMarkup(<BalanceCard {...props(dashboard())} />);
    expect(hrefs(html)).toEqual(["/en/account/wallet/add-funds", "/en/account/wallet"]);
    expect(html).toContain("$13.00");
  });
});

describe("the order counts", () => {
  it("link to the one orders page, filtered by status", () => {
    const html = renderToStaticMarkup(<OrderStats {...props(dashboard())} />);
    expect(hrefs(html)).toEqual([
      "/en/account/orders",
      "/en/account/orders?status=processing",
      "/en/account/orders?status=completed",
      "/en/account/orders?status=pending",
    ]);
  });

  it("add the four counts up for the total", () => {
    expect(renderToStaticMarkup(<OrderStats {...props(dashboard())} />)).toContain(">10<");
  });
});

describe("the latest orders", () => {
  it("open each order on its own page in the account area, in the list and in the table", () => {
    const html = renderToStaticMarkup(<RecentOrders {...props(dashboard([order(7), order(8)]))} />);
    const links = hrefs(html);
    expect(links).toContain("/en/account/orders/7");
    expect(links).toContain("/en/account/orders/8");
    expect(links).toContain("/en/account/orders");
    expect(links.filter((href) => href.startsWith("/en/account/orders/"))).toHaveLength(4);
  });

  it("points the empty state at the shop's services, where a merchant rank sees its own prices (decision 003)", () => {
    const html = renderToStaticMarkup(<RecentOrders {...props(dashboard())} />);
    expect(hrefs(html)).toContain("/en/services");
    expect(hrefs(html)).not.toContain("/en/account/services");
  });

  it("never names the old portal folder, whatever it shows", () => {
    for (const html of [
      renderToStaticMarkup(<BalanceCard {...props(dashboard())} />),
      renderToStaticMarkup(<OrderStats {...props(dashboard())} />),
      renderToStaticMarkup(<RecentOrders {...props(dashboard([order(7)]))} />),
      renderToStaticMarkup(<RecentOrders {...props(dashboard())} />),
      renderToStaticMarkup(<HelpCard t={merchant} />),
    ]) {
      expect(hrefs(html).filter((href) => href.includes("/merchant"))).toEqual([]);
    }
  });
});
