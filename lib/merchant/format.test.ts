import { describe, expect, it } from "vitest";
import { formatMinutes, humanizeKind, isHttpUrl, labelOf, ltr } from "./format";

describe("formatMinutes", () => {
  it("splits minutes into days, hours and minutes", () => {
    expect(formatMinutes(5, "en")).toBe("5 min");
    expect(formatMinutes(60, "en")).toBe("1 hr");
    expect(formatMinutes(90, "en")).toBe("1 hr 30 min");
    expect(formatMinutes(2880, "en")).toBe("2 days");
  });
});

describe("kinds and urls", () => {
  it("humanizes a ledger kind and prefers a translation", () => {
    expect(humanizeKind("order_hold")).toBe("Order hold");
    expect(labelOf({ deposit: "Deposit" }, "deposit")).toBe("Deposit");
    expect(labelOf({ deposit: "Deposit" }, "fx_gain")).toBe("Fx gain");
  });
  it("accepts only http(s) payment urls", () => {
    expect(isHttpUrl("https://pay.example/checkout/1")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("data:text/html,x")).toBe(false);
    expect(isHttpUrl("/relative")).toBe(false);
  });
});

describe("ltr", () => {
  it("isolates the text and drops direction marks that would flip it again", () => {
    expect(ltr("\u200f50.00 US$")).toBe("\u206650.00 US$\u2069");
    expect(ltr("1%")).toBe("\u20661%\u2069");
  });
});
