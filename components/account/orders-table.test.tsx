// The two orders tables (components/account/orders-table.tsx): where each row leads, and what each kind of row shows.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The action buttons of a merchant row read the router from next/navigation and the error texts from the layout's provider.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));

import type { CustomerOrder, MerchantOrder } from "@/lib/api/types";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { errors } from "@/lib/i18n/messages/errors";
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

/** The merchant table as the page draws it: the error texts come from the root layout. */
const drawMerchant = (rows: MerchantOrder[]) =>
  renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <MerchantOrdersTable rows={rows} />
    </ErrorTextProvider>,
  );

describe("MerchantOrdersTable (merchant rows)", () => {
  it("opens the order's own page in the account area, from the number link", () => {
    const html = drawMerchant([merchantOrder()]);
    expect(html).toContain('href="/en/account/orders/42"');
    expect(html).toContain('aria-label="Open order 42"');
    expect(html).not.toContain("/en/track/");
  });

  it("shows the input, the quantity and the total of the row", () => {
    const html = drawMerchant([merchantOrder()]);
    expect(html).toContain("490154203237518");
    expect(html).toContain("Carrier check");
    expect(html).toContain("$3.00");
  });

  it("shows a file input as such and a verification as its badge", () => {
    const html = drawMerchant([merchantOrder({ imei: "", inputFileId: 9, verificationStatus: "accepted" })]);
    expect(html).toContain("File");
    expect(html).toContain("Accepted");
  });
});

describe("MerchantOrdersTable: the Actions column", () => {
  const headers = (html: string) => [...html.matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((m) => m[1]);

  it("is the last column, headed Actions", () => {
    const list = headers(drawMerchant([merchantOrder()]));
    expect(list.at(-1)).toBe("Actions");
    expect(list).toHaveLength(9);
  });

  it("gives a row that can be cancelled a small Cancel button, named after the order", () => {
    const html = drawMerchant([merchantOrder({ canCancel: true, canVerify: false })]);
    expect(html).toContain('aria-label="Cancel order 42"');
    expect(html).not.toContain("Verify order");
  });

  it("gives a row that can be verified a small Verify button", () => {
    const html = drawMerchant([merchantOrder({ status: "completed", canCancel: false, canVerify: true })]);
    expect(html).toContain('aria-label="Verify order 42"');
    expect(html).not.toContain("Cancel order 42");
  });

  it("gives a row both buttons when both are allowed", () => {
    const html = drawMerchant([merchantOrder({ canCancel: true, canVerify: true })]);
    expect(html).toContain('aria-label="Cancel order 42"');
    expect(html).toContain('aria-label="Verify order 42"');
  });

  it("a row with no action has no button and an em dash, like the other empty cells, dropped on phones", () => {
    const html = drawMerchant([merchantOrder({ canCancel: false, canVerify: false })]);
    expect(html).not.toContain("Cancel order 42");
    expect(html).not.toContain("Verify order 42");
    const cell = [...html.matchAll(/<td[^>]*data-label="Actions"[^>]*>(.*?)<\/td>/g)];
    expect(cell).toHaveLength(1);
    expect(cell[0][0]).toContain("max-md:hidden");
    expect(cell[0][1]).toContain("—");
  });

  it("on phones the buttons take a line of their own above the row's link, which stays the way to open the order", () => {
    const html = drawMerchant([merchantOrder({ canCancel: true })]);
    const cell = html.match(/<td[^>]*data-label="Actions"[^>]*>/)?.[0] ?? "";
    expect(cell).toContain("max-md:z-10");
    expect(cell).toContain("max-md:basis-full");
    expect(html).toContain("max-md:after:absolute");
    expect(html).toContain('href="/en/account/orders/42"');
  });

  it("each row has its own buttons: only the rows that have an action show one", () => {
    const html = drawMerchant([merchantOrder({ id: 1, canCancel: true }), merchantOrder({ id: 2, canCancel: false }), merchantOrder({ id: 3, canVerify: true, canCancel: false })]);
    expect(html).toContain('aria-label="Cancel order 1"');
    expect(html).not.toContain("Cancel order 2");
    expect(html).toContain('aria-label="Verify order 3"');
  });

  it("an older backend (no new keys) is drawn from the two flags alone", () => {
    const row = merchantOrder({ canCancel: true });
    expect(row.cancelUntil).toBeUndefined();
    expect(drawMerchant([row])).toContain('aria-label="Cancel order 42"');
  });
});
