import { describe, expect, it } from "vitest";
import { orderChoices, orderText, type RecentOrder } from "./order-choices";

const TEMPLATE = "{order} · {service} · {date}";
const orders: RecentOrder[] = [
  { id: 12, service: "iPhone unlock", createdAt: "2026-11-09T12:00:00.000Z" },
  { id: 9, service: "Carrier check", createdAt: "2026-11-05T12:00:00.000Z" },
];

describe("orderText", () => {
  it("names a retail order SF-<id> and a merchant order #<id>", () => {
    expect(orderText("store", 12)).toBe("SF-12");
    expect(orderText("client", 12)).toBe("#12");
  });
});

describe("orderChoices", () => {
  it("lists each recent order with its family's name, service and date", () => {
    const retail = orderChoices("store", orders, null, TEMPLATE);
    expect(retail.map((choice) => choice.id)).toEqual([12, 9]);
    expect(retail[0].label).toMatch(/^SF-12 · iPhone unlock · .+/);
    const merchant = orderChoices("client", orders, null, TEMPLATE);
    expect(merchant[1].label).toMatch(/^#9 · Carrier check · .+/);
  });

  it("offers an order of ?order= that is older than the recent ones by its number alone, first", () => {
    expect(orderChoices("store", orders, 3, TEMPLATE).slice(0, 2)).toEqual([
      { id: 3, label: "SF-3" },
      expect.objectContaining({ id: 12 }),
    ]);
    expect(orderChoices("client", orders, 3, TEMPLATE)[0]).toEqual({ id: 3, label: "#3" });
  });

  it("adds nothing for an order that is already listed, or when no order was asked for", () => {
    expect(orderChoices("store", orders, 9, TEMPLATE).map((choice) => choice.id)).toEqual([12, 9]);
    expect(orderChoices("store", orders, null, TEMPLATE)).toHaveLength(2);
  });

  it("still offers the asked-for order when the read of the recent orders failed (an empty list)", () => {
    expect(orderChoices("client", [], 5, TEMPLATE)).toEqual([{ id: 5, label: "#5" }]);
    expect(orderChoices("store", [], null, TEMPLATE)).toEqual([]);
  });
});
