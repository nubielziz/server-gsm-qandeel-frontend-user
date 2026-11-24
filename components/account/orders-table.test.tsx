// The two orders tables (components/account/orders-table.tsx): where each row leads, and what each kind of row shows.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CustomerOrder, MerchantOrder } from "@/lib/api/types";
import { MerchantOrdersTable, OrdersTable, orderLabel } from "./orders-table";

const retailOrder = (over: Partial<CustomerOrder> = {}): CustomerOrder => ({
  id: 12,
  status: "completed",
  service: { id: 3, name: "Carrier check" },
  imei: "490154203237518",
  quantity: 1,
  totalPrice: "5.0000",
  taxAmount: "0.0000",
  currency: "USD",
  trackingToken: "t_abc123",
  createdAt: "2026-11-01T10:00:00.000Z",
  completedAt: null,
  ...over,
});

const merchantOrder = (over: Partial<MerchantOrder> = {}): MerchantOrder => ({
  id: 42,
  status: "processing",
  imei: "490154203237518",
  quantity: 3,
  inputs: {},
  unitPrice: "1.0000",
  totalPrice: "3.0000",
  currency: "USD",
  service: { id: 3, name: "Carrier check", type: "imei" },
  source: "portal",
  result: { code: null, comment: null, fileId: null },
  verificationStatus: null,
  inputFileId: null,
  canCancel: true,
  canVerify: false,
  createdAt: "2026-11-01T10:00:00.000Z",
  completedAt: null,
  ...over,
});

describe("OrdersTable (retail rows)", () => {
  it("opens the tracking page of the row's token and nothing else", () => {
    const html = renderToStaticMarkup(<OrdersTable orders={[retailOrder()]} />);
    expect(html).toContain('href="/en/track/t_abc123"');
    expect(html).toContain('aria-label="Track order SF-12"');
    expect(html).not.toContain("/account/orders/");
  });

  it("says so when a row has no tracking page, and links nowhere", () => {
    const html = renderToStaticMarkup(<OrdersTable orders={[retailOrder({ trackingToken: null })]} />);
    expect(html).toContain("Not available");
    expect(html).not.toContain("/en/track/");
  });

  it("names an order the way emails and receipts do", () => {
    expect(orderLabel(12)).toBe("SF-12");
    expect(renderToStaticMarkup(<OrdersTable orders={[retailOrder()]} />)).toContain("SF-12");
  });

  it("is honest about VAT and the currency the customer paid in", () => {
    const html = renderToStaticMarkup(<OrdersTable orders={[retailOrder({ taxAmount: "1.0000", currency: "EUR" })]} />);
    expect(html).toContain("VAT");
    expect(html).toContain("Paid in EUR");
    const plain = renderToStaticMarkup(<OrdersTable orders={[retailOrder()]} />);
    expect(plain).not.toContain("VAT ");
    expect(plain).not.toContain("Paid in");
  });

  it("drops the details and quantity columns when compact", () => {
    const full = renderToStaticMarkup(<OrdersTable orders={[retailOrder()]} />);
    const compact = renderToStaticMarkup(<OrdersTable orders={[retailOrder()]} compact />);
    expect(full).toContain("Details");
    expect(full).toContain("Qty");
    expect(compact).not.toContain("Details");
    expect(compact).not.toContain("Qty");
  });
});

describe("MerchantOrdersTable (merchant rows)", () => {
  it("opens the order's own page in the account area, from the number link", () => {
    const html = renderToStaticMarkup(<MerchantOrdersTable rows={[merchantOrder()]} />);
    expect(html).toContain('href="/en/account/orders/42"');
    expect(html).toContain('aria-label="Open order 42"');
    expect(html).not.toContain("/en/track/");
  });

  it("shows the input, the quantity and the total of the row", () => {
    const html = renderToStaticMarkup(<MerchantOrdersTable rows={[merchantOrder()]} />);
    expect(html).toContain("490154203237518");
    expect(html).toContain("Carrier check");
    expect(html).toContain("$3.00");
  });

  it("shows a file input as such and a verification as its badge", () => {
    const html = renderToStaticMarkup(
      <MerchantOrdersTable rows={[merchantOrder({ imei: "", inputFileId: 9, verificationStatus: "accepted" })]} />,
    );
    expect(html).toContain("File");
    expect(html).toContain("Accepted");
  });
});
