import { describe, expect, it } from "vitest";
import { compareMoney, formatMoney, imeiProblem, isValidImei, latinDigits, maskImei, normalizeImei, subtractMoney, sumMoney } from "./index";

describe("money math on 4-decimal strings", () => {
  it("sums exactly where floats would drift", () => {
    expect(sumMoney(["0.1000", "0.2000"])).toBe("0.3000");
    expect(sumMoney(["12.4900", "7.5100", "-20.0000"])).toBe("0.0000");
    expect(sumMoney([])).toBe("0.0000");
  });
  it("subtracts and compares", () => {
    expect(subtractMoney("245.0000", "2.5000")).toBe("242.5000");
    expect(subtractMoney("1.0000", "2.5000")).toBe("-1.5000");
    expect(compareMoney("10.0000", "9.9999")).toBe(1);
    expect(compareMoney("-1.0000", "0.0000")).toBe(-1);
    expect(compareMoney("3.1000", "3.1")).toBe(0);
  });
  it("rejects non-money strings", () => {
    expect(() => sumMoney(["12,49"])).toThrow();
  });
});

describe("formatMoney", () => {
  it("formats from the exact string with the currency's decimals", () => {
    expect(formatMoney("12.4900", "USD", 2)).toBe("$12.49");
    expect(formatMoney("1234.5000", "USD", 2)).toBe("$1,234.50");
    expect(formatMoney("100.0000", "JOD", 3)).toContain("100.000");
  });
  it("falls back to plain text for an unknown currency code", () => {
    expect(formatMoney("5.0000", "NOT-A-CODE")).toBe("5.0000 NOT-A-CODE");
  });
});

describe("latinDigits", () => {
  it("turns Arabic-Indic and Persian digits into Latin ones and touches nothing else", () => {
    expect(latinDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(latinDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(latinDigits("aa:bb-٣٤ 56, 0x1F\n")).toBe("aa:bb-34 56, 0x1F\n");
    expect(latinDigits("")).toBe("");
  });
});

describe("IMEI helpers", () => {
  it("normalizes like the API (spaces and dashes)", () => {
    expect(normalizeImei("49-015420 323751 8")).toBe("490154203237518");
    expect(normalizeImei("٤٩٠١٥٤٢٠٣٢٣٧٥١٨")).toBe("490154203237518");
    expect(normalizeImei("۴۹۰۱۵۴۲۰۳۲۳۷۵۱۸")).toBe("490154203237518");
    expect(isValidImei("٤٩٠١٥٤٢٠٣٢٣٧٥١٨")).toBe(true);
  });
  it("checks the Luhn digit", () => {
    expect(isValidImei("490154203237518")).toBe(true);
    expect(isValidImei("490154203237519")).toBe(false);
    expect(isValidImei("49015420323751")).toBe(false);
  });
  it("names what is wrong with a typed IMEI: its length first, then the check digit", () => {
    expect(imeiProblem("490154203237518")).toBeNull();
    expect(imeiProblem("4901 5420-3237 518")).toBeNull();
    expect(imeiProblem("")).toBe("length");
    expect(imeiProblem("49015420323751")).toBe("length");
    expect(imeiProblem("49015420323751x")).toBe("length");
    expect(imeiProblem("490154203237519")).toBe("checksum");
  });
  it("masks all but the last four digits of an IMEI, read as digits", () => {
    expect(maskImei("490154203237518")).toBe("•••••••••••7518");
    expect(maskImei("4901 5420-3237 518")).toBe("•••••••••••7518");
    expect(maskImei("٤٩٠١٥٤٢٠٣٢٣٧٥١٨")).toBe("•••••••••••7518");
    expect(maskImei("4901")).toBe("4901");
    expect(maskImei("")).toBe("");
  });
});
