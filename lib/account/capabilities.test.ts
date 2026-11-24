import { describe, expect, it } from "vitest";
import { capabilitiesOf } from "./capabilities";

const retail = (extra: Record<string, unknown> = {}) => ({ rank: { kind: "retail" }, hasPassword: true, ...extra });
const merchant = (extra: Record<string, unknown> = {}) => ({ rank: { kind: "merchant" }, hasPassword: true, ...extra });

describe("capabilitiesOf: the merchant-only features", () => {
  it("gives a retail rank no price list, no invoices, no API keys and no notification switches", () => {
    const caps = capabilitiesOf(retail());
    expect(caps.priceList).toBe(false);
    expect(caps.invoices).toBe(false);
    expect(caps.apiKeys).toBe(false);
    expect(caps.notificationPreferences).toBe(false);
  });

  it("gives a merchant rank all four", () => {
    const caps = capabilitiesOf(merchant());
    expect(caps.priceList).toBe(true);
    expect(caps.invoices).toBe(true);
    expect(caps.apiKeys).toBe(true);
    expect(caps.notificationPreferences).toBe(true);
  });

  it("fails closed: an unknown kind, a missing rank or a signed-out visitor gets none of the four", () => {
    const unknown: unknown[] = [
      { rank: { kind: "wholesale" }, hasPassword: true },
      { rank: { kind: "Merchant" }, hasPassword: true },
      { rank: { kind: "" }, hasPassword: true },
      { rank: null, hasPassword: true },
      { hasPassword: true },
      null,
      undefined,
    ];
    for (const me of unknown) {
      const caps = capabilitiesOf(me as never);
      expect([caps.priceList, caps.invoices, caps.apiKeys, caps.notificationPreferences], JSON.stringify(me)).toEqual([
        false,
        false,
        false,
        false,
      ]);
    }
  });
});

describe("capabilitiesOf: two-step sign-in", () => {
  it("is offered only to an account that has a password, whatever its rank", () => {
    expect(capabilitiesOf(retail({ hasPassword: true })).twoStep).toBe(true);
    expect(capabilitiesOf(merchant({ hasPassword: true })).twoStep).toBe(true);
    expect(capabilitiesOf(retail({ hasPassword: false })).twoStep).toBe(false);
    expect(capabilitiesOf(merchant({ hasPassword: false })).twoStep).toBe(false);
  });

  it("treats an unknown password state as no password", () => {
    expect(capabilitiesOf({ rank: { kind: "retail" } }).twoStep).toBe(false);
    expect(capabilitiesOf(retail({ hasPassword: null })).twoStep).toBe(false);
    expect(capabilitiesOf(retail({ hasPassword: "true" })).twoStep).toBe(false);
  });

  it("is not offered to a visitor who is not signed in", () => {
    expect(capabilitiesOf(null).twoStep).toBe(false);
    expect(capabilitiesOf(undefined).twoStep).toBe(false);
  });
});

describe("capabilitiesOf: privacy requests", () => {
  it("offers the data export to both ranks", () => {
    expect(capabilitiesOf(retail()).dataExport).toBe(true);
    expect(capabilitiesOf(merchant()).dataExport).toBe(true);
    expect(capabilitiesOf(retail({ hasPassword: false })).dataExport).toBe(true);
  });

  it("offers erasure to the retail rank only", () => {
    expect(capabilitiesOf(retail()).dataErasure).toBe(true);
    expect(capabilitiesOf(merchant()).dataErasure).toBe(false);
  });

  it("offers nothing to a visitor who is not signed in", () => {
    const caps = capabilitiesOf(null);
    expect(caps.dataExport).toBe(false);
    expect(caps.dataErasure).toBe(false);
  });
});

describe("capabilitiesOf: the rank it echoes", () => {
  it("names the rank kind and the family it decided on", () => {
    expect(capabilitiesOf(retail())).toMatchObject({ rankKind: "retail", family: "store" });
    expect(capabilitiesOf(merchant())).toMatchObject({ rankKind: "merchant", family: "client" });
    expect(capabilitiesOf(null)).toMatchObject({ rankKind: "retail", family: "store" });
  });

  it("gives every signed-out flag as false", () => {
    const caps = capabilitiesOf(null);
    const flags = Object.entries(caps).filter(([, value]) => typeof value === "boolean");
    expect(flags.length).toBeGreaterThan(0);
    for (const [name, value] of flags) expect(value, name).toBe(false);
  });
});
