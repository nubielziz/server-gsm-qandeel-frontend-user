import { describe, expect, it } from "vitest";
import { changedEventRows, type EventMap } from "./notifications-form";

// What the isolated demo API shows an unlinked merchant (curl GET /client/notification-preferences).
const base: EventMap = {
  "wallet.low_balance": { email: true, telegram: false },
  "order.completed": { email: false, telegram: false },
  "broadcast.announcement": { email: true, telegram: true },
};
const order = Object.keys(base);

describe("changedEventRows: the rows of PUT /client/notification-preferences", () => {
  it("sends nothing when no switch changed", () => {
    expect(changedEventRows(order, base, base, false)).toEqual([]);
    expect(changedEventRows(order, base, base, true)).toEqual([]);
  });

  it("an Email switch alone goes back with the Telegram value the GET showed (Announcements keep Telegram on)", () => {
    const working = { ...base, "broadcast.announcement": { email: false, telegram: true } };
    expect(changedEventRows(order, working, base, false)).toEqual([{ event: "broadcast.announcement", email: false, telegram: true }]);
  });

  it("while Telegram is not linked a Telegram change never goes out: the row carries the shown value", () => {
    const working = { ...base, "wallet.low_balance": { email: true, telegram: true } };
    expect(changedEventRows(order, working, base, false)).toEqual([]);
    const both = { ...base, "wallet.low_balance": { email: false, telegram: true } };
    expect(changedEventRows(order, both, base, false)).toEqual([{ event: "wallet.low_balance", email: false, telegram: false }]);
  });

  it("an unlinked Announcements row is not switched off by anything but the merchant", () => {
    // The old unlink handler flipped every Telegram switch off; the shown `true` must stay `true`.
    expect(changedEventRows(order, base, base, false)).toEqual([]);
    expect(changedEventRows(order, base, base, false).some((row) => row.telegram === false && row.event === "broadcast.announcement")).toBe(false);
  });

  it("once Telegram is linked a Telegram change is sent", () => {
    const working = { ...base, "wallet.low_balance": { email: true, telegram: true } };
    expect(changedEventRows(order, working, base, true)).toEqual([{ event: "wallet.low_balance", email: true, telegram: true }]);
  });

  it("keeps the list order and sends every changed row", () => {
    const working: EventMap = {
      "wallet.low_balance": { email: false, telegram: false },
      "order.completed": { email: true, telegram: false },
      "broadcast.announcement": { email: true, telegram: true },
    };
    expect(changedEventRows(order, working, base, false).map((row) => row.event)).toEqual(["wallet.low_balance", "order.completed"]);
  });

  it("an event the page did not know when it loaded is compared with both switches off", () => {
    expect(changedEventRows(["new.event"], { "new.event": { email: true, telegram: false } }, {}, false)).toEqual([
      { event: "new.event", email: true, telegram: false },
    ]);
    expect(changedEventRows(["new.event"], {}, {}, false)).toEqual([]);
  });
});
