import { describe, expect, it } from "vitest";
import { changedEventRows, toEventMap, type EventMap } from "./notifications-form";

// What the isolated demo API shows today: each event also carries the older API's `telegram` flag.
const older: EventMap = {
  "wallet.low_balance": { email: true, telegram: false },
  "order.completed": { email: false, telegram: false },
  "broadcast.announcement": { email: true, telegram: true },
};
// What an API without that flag shows.
const newer: EventMap = {
  "wallet.low_balance": { email: true },
  "order.completed": { email: false },
  "broadcast.announcement": { email: true },
};
const order = Object.keys(older);

describe("toEventMap: the events as the API showed them", () => {
  it("keeps the older API's flag, and adds none when the API sent none", () => {
    const events = [
      { event: "wallet.low_balance", label: "Low wallet balance", email: true, telegram: true },
      { event: "order.completed", label: "Order completed", email: false },
    ];
    expect(toEventMap(events)).toEqual({
      "wallet.low_balance": { email: true, telegram: true },
      "order.completed": { email: false },
    });
  });
});

describe("changedEventRows: the rows of PUT /client/notification-preferences", () => {
  it("sends nothing when no switch changed", () => {
    expect(changedEventRows(order, older, older)).toEqual([]);
    expect(changedEventRows(order, newer, newer)).toEqual([]);
  });

  it("an email change sends the row with the new value", () => {
    const working = { ...newer, "order.completed": { email: true } };
    expect(changedEventRows(order, working, newer)).toEqual([{ event: "order.completed", email: true }]);
  });

  it("a row for an older API goes back with the flag value the GET showed, whatever it was", () => {
    const working = { ...older, "broadcast.announcement": { email: false, telegram: true } };
    expect(changedEventRows(order, working, older)).toEqual([{ event: "broadcast.announcement", email: false, telegram: true }]);
    const other = { ...older, "wallet.low_balance": { email: false, telegram: false } };
    expect(changedEventRows(order, other, older)).toEqual([{ event: "wallet.low_balance", email: false, telegram: false }]);
  });

  it("a row for an API that showed no flag carries none", () => {
    const working = { ...newer, "wallet.low_balance": { email: false } };
    const [row] = changedEventRows(order, working, newer);
    expect(row).toEqual({ event: "wallet.low_balance", email: false });
    expect("telegram" in row).toBe(false);
  });

  it("keeps the list order and sends every changed row", () => {
    const working: EventMap = {
      "wallet.low_balance": { email: false },
      "order.completed": { email: true },
      "broadcast.announcement": { email: true },
    };
    expect(changedEventRows(order, working, newer).map((row) => row.event)).toEqual(["wallet.low_balance", "order.completed"]);
  });

  it("an event the page did not know when it loaded is compared with its switch off", () => {
    expect(changedEventRows(["new.event"], { "new.event": { email: true } }, {})).toEqual([{ event: "new.event", email: true }]);
    expect(changedEventRows(["new.event"], {}, {})).toEqual([]);
  });
});
