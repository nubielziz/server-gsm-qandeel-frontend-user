import { describe, expect, it } from "vitest";
import { isMoney, mulMoney, parseAmountInput, percentOf, topUpFee } from "./money-math";

describe("mulMoney", () => {
  it("is exact where floats drift", () => {
    expect(0.1 * 3).not.toBe(0.3);
    expect(mulMoney("0.1000", 3)).toBe("0.3000");
    expect(mulMoney("0.0900", 100)).toBe("9.0000");
    expect(mulMoney("35.9200", 7)).toBe("251.4400");
  });
  it("handles big quantities and a zero quantity", () => {
    expect(mulMoney("12.4900", 100000)).toBe("1249000.0000");
    expect(mulMoney("12.4900", 0)).toBe("0.0000");
  });
  it("rounds half up when the price has more than 4 places", () => {
    expect(mulMoney("0.00005", 1)).toBe("0.0001");
    expect(mulMoney("0.00004", 1)).toBe("0.0000");
    expect(mulMoney("1.5", 3)).toBe("4.5000");
  });
  it("refuses bad input", () => {
    expect(() => mulMoney("1,5", 1)).toThrow();
    expect(() => mulMoney("1.0000", -1)).toThrow();
    expect(() => mulMoney("1.0000", 1.5)).toThrow();
  });
});

describe("percentOf and topUpFee", () => {
  it("computes percentages exactly", () => {
    expect(percentOf("200.0000", "2.5")).toBe("5.0000");
    expect(percentOf("100.0000", "1.0000")).toBe("1.0000");
    expect(percentOf("0.0100", "50")).toBe("0.0050");
    expect(percentOf("123.4567", "0.0000")).toBe("0.0000");
  });
  it("rounds half up at the fourth place", () => {
    expect(percentOf("0.0001", "50")).toBe("0.0001"); // 0.00005 → 0.0001
    expect(percentOf("0.0001", "49")).toBe("0.0000"); // 0.000049 → 0.0000
  });
  it("adds the fixed fee", () => {
    expect(topUpFee("100.0000", "1.0000", "0.3000")).toBe("1.3000");
    expect(topUpFee("50.0000", "0.0000", "0.0000")).toBe("0.0000");
    expect(topUpFee("250.5000", "2.9000", "0.3000")).toBe("7.5645");
  });
});

describe("parseAmountInput", () => {
  it("accepts amounts with up to four places", () => {
    expect(parseAmountInput("50")).toBe("50.0000");
    expect(parseAmountInput(" 12.5 ")).toBe("12.5000");
    expect(parseAmountInput(".5")).toBe("0.5000");
    expect(parseAmountInput("0.0001")).toBe("0.0001");
    expect(parseAmountInput("1000.1234")).toBe("1000.1234");
  });
  it("reads Arabic-Indic digits and the Arabic decimal mark", () => {
    expect(parseAmountInput("٥٠٫٢٥")).toBe("50.2500");
  });
  it("refuses zero, negatives, extra places, commas and text", () => {
    expect(parseAmountInput("")).toBeNull();
    expect(parseAmountInput(".")).toBeNull();
    expect(parseAmountInput("0")).toBeNull();
    expect(parseAmountInput("0.0000")).toBeNull();
    expect(parseAmountInput("-5")).toBeNull();
    expect(parseAmountInput("1.23456")).toBeNull();
    expect(parseAmountInput("1,000")).toBeNull();
    expect(parseAmountInput("12abc")).toBeNull();
  });
});

describe("isMoney", () => {
  it("matches the API's money shape", () => {
    expect(isMoney("12.4900")).toBe(true);
    expect(isMoney("-0.0100")).toBe(true);
    expect(isMoney("12.49")).toBe(false);
  });
});
