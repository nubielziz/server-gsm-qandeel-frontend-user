import { describe, expect, it } from "vitest";
import { approximateIn, convertMoney } from "./convert";

describe("convertMoney", () => {
  it("multiplies a USD amount by the rate, exactly, with four decimals", () => {
    expect(convertMoney("50.0000", "0.70900000")).toBe("35.4500");
    expect(convertMoney("20.0000", "3.72505000")).toBe("74.5010");
    expect(convertMoney("0.0000", "0.70900000")).toBe("0.0000");
    // A float gives 0.30000000000000004 for 0.1 × 3 and drifts on many amounts; the string math does not.
    expect(convertMoney("0.1000", "3.00000000")).toBe("0.3000");
    expect(convertMoney("1000.0000", "10.75900000")).toBe("10759.0000");
  });

  it("rounds half up at the fourth decimal", () => {
    // 0.0001 × 0.5 = 0.00005: exactly half → up.
    expect(convertMoney("0.0001", "0.50000000")).toBe("0.0001");
    // 0.00004999 → down.
    expect(convertMoney("0.0001", "0.49990000")).toBe("0.0000");
    // 1 × 0.33335 = 0.33335 → 0.3334; 0.33334999… stays 0.3333.
    expect(convertMoney("1.0000", "0.33335000")).toBe("0.3334");
    expect(convertMoney("1.0000", "0.33334999")).toBe("0.3333");
    // The reference case of the plan: 50 × 0.709 has no remainder.
    expect(convertMoney("50.0000", "0.70900000")).toBe("35.4500");
    // 12.3457 × 0.70900000 = 8.75308… → 8.7531.
    expect(convertMoney("12.3457", "0.70900000")).toBe("8.7531");
  });

  it("rounds a negative amount away from zero, like the positive one", () => {
    expect(convertMoney("-50.0000", "0.70900000")).toBe("-35.4500");
    expect(convertMoney("-0.0001", "0.50000000")).toBe("-0.0001");
    expect(convertMoney("-1.0000", "0.33335000")).toBe("-0.3334");
    // Rounds to zero: no "-0.0000".
    expect(convertMoney("-0.0001", "0.49990000")).toBe("0.0000");
  });

  it("takes amounts and rates with any number of decimals", () => {
    expect(convertMoney("5", "2")).toBe("10.0000");
    expect(convertMoney("5.5", "0.5")).toBe("2.7500");
    expect(convertMoney("100.0000", "0.93380000")).toBe("93.3800");
  });

  it("throws on a malformed amount or a rate that is not positive", () => {
    expect(() => convertMoney("abc", "1")).toThrow();
    expect(() => convertMoney("1,5", "1")).toThrow();
    expect(() => convertMoney("1e3", "1")).toThrow();
    expect(() => convertMoney("", "1")).toThrow();
    expect(() => convertMoney("1.0000", "")).toThrow();
    expect(() => convertMoney("1.0000", "-0.7")).toThrow();
    expect(() => convertMoney("1.0000", "0")).toThrow();
    expect(() => convertMoney("1.0000", "0.00000000")).toThrow();
  });
});

describe("approximateIn", () => {
  const jod = { code: "JOD", decimals: 2, fxRate: "0.70900000" };

  it("gives the converted amount with the currency's code and display decimals", () => {
    expect(approximateIn("20.0000", jod)).toEqual({ amount: "14.1800", currency: "JOD", decimals: 2 });
    expect(approximateIn("-20.0000", jod)).toEqual({ amount: "-14.1800", currency: "JOD", decimals: 2 });
  });

  it("gives nothing for USD itself", () => {
    expect(approximateIn("20.0000", { code: "USD", decimals: 2, fxRate: "1.00000000" })).toBeNull();
  });

  it("gives nothing, not a wrong number, when the rate is unusable", () => {
    expect(approximateIn("20.0000", { ...jod, fxRate: "" })).toBeNull();
    expect(approximateIn("20.0000", { ...jod, fxRate: "0.00000000" })).toBeNull();
    expect(approximateIn("20.0000", { ...jod, fxRate: "n/a" })).toBeNull();
    expect(approximateIn("not money", jod)).toBeNull();
  });
});
