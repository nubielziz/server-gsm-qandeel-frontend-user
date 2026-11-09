import { describe, expect, it } from "vitest";
import { toQueryString } from "@/lib/api/query";
import {
  countQuery,
  dayEndIso,
  dayStartIso,
  invoicesQuery,
  isDateOnly,
  ordersExportQuery,
  ordersQuery,
  parseInvoicesFilters,
  parseOrdersFilters,
  parseServicesFilters,
  pricesExportQuery,
  servicesQuery,
} from "./lists";

const qs = (q: Parameters<typeof toQueryString>[0]) => toQueryString(q);

describe("dates", () => {
  it("accepts only real calendar dates", () => {
    expect(isDateOnly("2026-11-09")).toBe(true);
    expect(isDateOnly("2026-02-30")).toBe(false);
    expect(isDateOnly("09/11/2026")).toBe(false);
  });
  it("builds the API's day bounds in UTC", () => {
    expect(dayStartIso("2026-11-09")).toBe("2026-11-09T00:00:00.000Z");
    expect(dayEndIso("2026-11-09")).toBe("2026-11-09T23:59:59.999Z");
  });
});

describe("services", () => {
  it("defaults to category,name and 50 rows", () => {
    const f = parseServicesFilters({});
    expect(qs(servicesQuery(f))).toBe("?_start=0&_end=50&_sort=category%2Cname&_order=asc%2Casc");
  });
  it("sends only declared, valid filters", () => {
    const f = parseServicesFilters({ q: " apple ", type: "imei", categoryId: "3", sort: "name", page: "2", junk: "x" });
    expect(qs(servicesQuery(f))).toBe("?_start=50&_end=100&_sort=name&_order=asc&q=apple&type=imei&categoryId=3");
  });
  it("drops values the API would refuse", () => {
    const f = parseServicesFilters({ type: "phone", categoryId: "abc", sort: "price" });
    expect(f).toMatchObject({ type: "", categoryId: "", sort: "category" });
  });
  it("exports with type and category only", () => {
    expect(qs(pricesExportQuery(parseServicesFilters({ q: "x", type: "file", categoryId: "2", page: "3" })))).toBe("?type=file&categoryId=2");
  });
});

describe("orders", () => {
  it("defaults to newest first, 25 per page", () => {
    expect(qs(ordersQuery(parseOrdersFilters({})))).toBe("?_start=0&_end=25&_sort=createdAt&_order=desc");
  });
  it("adds the date range as UTC day bounds", () => {
    const f = parseOrdersFilters({ status: "completed", from: "2026-11-01", to: "2026-11-09", sort: "total_asc", page: "3" });
    expect(qs(ordersQuery(f))).toBe(
      "?_start=50&_end=75&_sort=totalPrice&_order=asc&status=completed&createdAt_gte=2026-11-01T00%3A00%3A00.000Z&createdAt_lte=2026-11-09T23%3A59%3A59.999Z",
    );
  });
  it("ignores bad dates and statuses", () => {
    expect(parseOrdersFilters({ status: "done", from: "yesterday" })).toMatchObject({ status: "", from: "" });
  });
  it("exports without the range and without paging", () => {
    const f = parseOrdersFilters({ status: "pending", type: "imei", q: "iphone", from: "2026-11-01", page: "4" });
    expect(qs(ordersExportQuery(f))).toBe("?_sort=createdAt&_order=desc&q=iphone&status=pending&type=imei");
  });
});

describe("invoices", () => {
  it("builds the list query and reads the selected invoice", () => {
    const f = parseInvoicesFilters({ status: "open", kind: "topup", q: "INV-2026", sort: "total_desc", selected: "55" });
    expect(f.selected).toBe("55");
    expect(qs(invoicesQuery(f))).toBe("?_start=0&_end=20&_sort=total&_order=desc&q=INV-2026&status=open&kind=topup");
  });
  it("builds a count-only request", () => {
    expect(qs(countQuery({ status: "paid" }))).toBe("?_start=0&_end=1&status=paid");
  });
});

describe("hrefWith", () => {
  it("drops empty values and keeps the rest in order", async () => {
    const { hrefWith } = await import("./lists");
    expect(hrefWith("/en/merchant/orders", { status: "pending", q: "", type: undefined })).toBe("/en/merchant/orders?status=pending");
    expect(hrefWith("/en/merchant/orders", {})).toBe("/en/merchant/orders");
  });
});
