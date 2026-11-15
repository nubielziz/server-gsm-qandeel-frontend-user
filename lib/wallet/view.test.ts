import { describe, expect, it } from "vitest";
import { toQueryString } from "@/lib/api/query";
import type { CustomerStatementLine, StatementLine } from "@/lib/api/types";
import {
  CUSTOMER_STATEMENT_PER_PAGE,
  customerStatementRows,
  merchantStatementRows,
  orderRef,
  parseStatementRange,
  statementQuery,
  walletCapabilities,
} from "./view";

const FROZEN = { at: "2026-11-13T07:15:52.354Z" };

describe("walletCapabilities", () => {
  it("switched on, nothing in it: everything shows and works", () => {
    expect(walletCapabilities({ enabled: true, balance: "0.0000", frozen: null })).toEqual({
      show: true,
      canAddFunds: true,
      canPay: true,
      frozen: false,
      negative: false,
    });
  });

  it("switched off with a zero balance: nothing shows", () => {
    expect(walletCapabilities({ enabled: false, balance: "0.0000", frozen: null })).toEqual({
      show: false,
      canAddFunds: false,
      canPay: false,
      frozen: false,
      negative: false,
    });
  });

  it("switched off with a balance: it shows, but no Add funds and no payment", () => {
    expect(walletCapabilities({ enabled: false, balance: "20.0000", frozen: null })).toEqual({
      show: true,
      canAddFunds: false,
      canPay: false,
      frozen: false,
      negative: false,
    });
  });

  it("on hold: it shows, Add funds stays (a bank top-up works), payment does not", () => {
    expect(walletCapabilities({ enabled: true, balance: "20.0000", frozen: FROZEN })).toEqual({
      show: true,
      canAddFunds: true,
      canPay: false,
      frozen: true,
      negative: false,
    });
  });

  it("negative: it shows, Add funds stays, payment does not", () => {
    expect(walletCapabilities({ enabled: true, balance: "-5.0000", frozen: null })).toEqual({
      show: true,
      canAddFunds: true,
      canPay: false,
      frozen: false,
      negative: true,
    });
  });

  it("a negative balance shows even when the switch is off", () => {
    expect(walletCapabilities({ enabled: false, balance: "-0.0100", frozen: null })).toMatchObject({ show: true, negative: true, canAddFunds: false });
  });

  it("a hold on a switched-off wallet with a zero balance still shows nothing", () => {
    expect(walletCapabilities({ enabled: false, balance: "0.0000", frozen: FROZEN })).toMatchObject({ show: false, frozen: true });
  });

  it("treats an unreadable or missing balance as zero instead of throwing", () => {
    expect(walletCapabilities({ enabled: false, balance: "n/a", frozen: null }).show).toBe(false);
    expect(walletCapabilities({ enabled: true, balance: undefined as unknown as string, frozen: undefined as unknown as null })).toMatchObject({
      show: true,
      frozen: false,
      negative: false,
    });
  });
});

describe("parseStatementRange", () => {
  it("keeps real calendar dates", () => {
    expect(parseStatementRange({ from: "2026-11-01", to: "2026-11-13" })).toEqual({ from: "2026-11-01", to: "2026-11-13", invalid: false });
    expect(parseStatementRange({ from: "2026-11-13", to: "2026-11-13" })).toEqual({ from: "2026-11-13", to: "2026-11-13", invalid: false });
    expect(parseStatementRange({ from: "2026-11-01" })).toEqual({ from: "2026-11-01", to: "", invalid: false });
    expect(parseStatementRange({})).toEqual({ from: "", to: "", invalid: false });
  });

  it("drops what is not a date", () => {
    expect(parseStatementRange({ from: "2026-02-30", to: "tomorrow" })).toEqual({ from: "", to: "", invalid: false });
    expect(parseStatementRange({ from: "2026-13-01", to: "2026-11-13" })).toEqual({ from: "", to: "2026-11-13", invalid: false });
    expect(parseStatementRange({ from: "20261101", to: "" })).toEqual({ from: "", to: "", invalid: false });
  });

  it("drops both ends when the start is after the end", () => {
    expect(parseStatementRange({ from: "2026-11-14", to: "2026-11-13" })).toEqual({ from: "", to: "", invalid: true });
  });
});

describe("statementQuery", () => {
  const qs = (range: Parameters<typeof statementQuery>[0], page: number) => toQueryString(statementQuery(range, page));

  it("asks for 25 rows a page and sends nothing else without a range", () => {
    expect(CUSTOMER_STATEMENT_PER_PAGE).toBe(25);
    expect(qs({ from: "", to: "" }, 1)).toBe("?_start=0&_end=25");
    expect(qs({ from: "", to: "" }, 2)).toBe("?_start=25&_end=50");
    expect(qs({ from: "", to: "" }, 0)).toBe("?_start=0&_end=25");
  });

  it("sends the range as the first and the last millisecond of its days, in UTC", () => {
    expect(qs({ from: "2026-11-01", to: "2026-11-13" }, 1)).toBe(
      "?_start=0&_end=25&createdAt_gte=2026-11-01T00%3A00%3A00.000Z&createdAt_lte=2026-11-13T23%3A59%3A59.999Z",
    );
    expect(qs({ from: "2026-11-01", to: "" }, 1)).toBe("?_start=0&_end=25&createdAt_gte=2026-11-01T00%3A00%3A00.000Z");
    expect(qs({ from: "", to: "2026-11-13" }, 3)).toBe("?_start=50&_end=75&createdAt_lte=2026-11-13T23%3A59%3A59.999Z");
  });

  it("never sends a sort, a search or any other parameter: the route answers 422 to an unknown one", () => {
    const names = (text: string) => [...new URLSearchParams(text).keys()].sort();
    expect(names(qs({ from: "2026-11-01", to: "2026-11-02" }, 1))).toEqual(["_end", "_start", "createdAt_gte", "createdAt_lte"]);
    expect(names(qs({ from: "", to: "" }, 1))).toEqual(["_end", "_start"]);
  });
});

describe("statement rows", () => {
  const customerLine = (over: Partial<CustomerStatementLine> = {}): CustomerStatementLine => ({
    id: 5900,
    transactionId: 2152,
    kind: "adjustment",
    memo: "Balance adjustment: refund for the lost IMEI promo (staff note)",
    orderId: null,
    amount: "20.0000",
    balanceAfter: "20.0000",
    createdAt: "2026-11-13T07:15:52.309Z",
    ...over,
  });

  it("names an order by its SF label", () => {
    expect(orderRef(1234)).toBe("SF-1234");
  });

  it("never shows a customer line's memo", () => {
    const [row] = customerStatementRows([customerLine()], (ref) => `Order ${ref}`);
    expect(row).toEqual({
      id: 5900,
      kind: "adjustment",
      details: null,
      amount: "20.0000",
      balanceAfter: "20.0000",
      createdAt: "2026-11-13T07:15:52.309Z",
    });
    expect(JSON.stringify(row)).not.toMatch(/staff note|Balance adjustment/);
  });

  it("says which order a customer line is about", () => {
    const rows = customerStatementRows(
      [customerLine({ id: 1, kind: "b2c_payment", orderId: 77, amount: "-9.0000", balanceAfter: "11.0000" }), customerLine({ id: 2 })],
      (ref) => `Order ${ref}`,
    );
    expect(rows.map((r) => r.details)).toEqual(["Order SF-77", null]);
    expect(rows[0]).toMatchObject({ kind: "b2c_payment", amount: "-9.0000", balanceAfter: "11.0000" });
  });

  it("keeps a merchant line's memo as its description", () => {
    const lines: StatementLine[] = [
      { id: 1, transactionId: 10, kind: "order_hold", memo: "Hold for ORD-5", amount: "-3.0000", balanceAfter: "7.0000", createdAt: "2026-11-12T10:00:00.000Z" },
      { id: 2, transactionId: 11, kind: "deposit", memo: "", amount: "10.0000", balanceAfter: "10.0000", createdAt: "2026-11-11T10:00:00.000Z" },
    ];
    expect(merchantStatementRows(lines)).toEqual([
      { id: 1, kind: "order_hold", details: "Hold for ORD-5", amount: "-3.0000", balanceAfter: "7.0000", createdAt: "2026-11-12T10:00:00.000Z" },
      { id: 2, kind: "deposit", details: null, amount: "10.0000", balanceAfter: "10.0000", createdAt: "2026-11-11T10:00:00.000Z" },
    ]);
  });
});
