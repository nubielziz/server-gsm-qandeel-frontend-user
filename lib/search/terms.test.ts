import { describe, expect, it } from "vitest";
import { imeiFromQuery, isRecordableTerm, luhnDigit, normaliseQuery, searchText } from "./terms";

describe("normaliseQuery", () => {
  it("lower-cases, collapses whitespace and trims", () => {
    expect(normaliseQuery("  SAMSUNG \t  FRP  ")).toBe("samsung frp");
    expect(normaliseQuery("")).toBe("");
  });
});

describe("searchText: the API's normaliseText (backend plan 29 §4.3)", () => {
  it("is empty for a text the search routes would refuse", () => {
    for (const text of ["&", "()", "😀", "&amp;", "&#38;", "&#x26;", " [ ] { } < > | , ; : ", "👨‍👩‍👧", "\u0000\t", "&lt;&gt;"]) {
      expect(searchText(text), text).toBe("");
    }
  });

  it("keeps the words: entities decoded once, `&` removed, brackets and separators to spaces", () => {
    expect(searchText("AT&amp;T")).toBe("att");
    expect(searchText("AT&T")).toBe("att");
    expect(searchText("Samsung FRP (1-24 hours)")).toBe("samsung frp 1-24 hours");
    expect(searchText("iPhone 15 😀 Pro")).toBe("iphone 15 pro");
    expect(searchText("O&#39;Brien &quot;x&quot;")).toBe("o'brien \"x\"");
    expect(searchText("&amp;amp;")).toBe("amp");
    expect(searchText("&unknown;")).toBe("unknown");
    expect(searchText("ＳＭ-Ａ525Ｆ")).toBe("sm-a525f");
    expect(searchText("a\u0000b")).toBe("a b");
  });
});

describe("isRecordableTerm: what may be kept (recent searches, statistics)", () => {
  it("keeps ordinary searches and model codes", () => {
    for (const term of ["icloud", "samsung frp", "a525f", "SM-A525F", "iphone 15 pro max", "at&t"]) expect(isRecordableTerm(term), term).toBe(true);
  });

  it("never keeps an IMEI, a phone number, an email, an order number or a link", () => {
    for (const term of [
      "356938035643809",
      "3569 3803 5643 809",
      "+962791234567",
      "0791234567",
      "someone@mail.example",
      "order 123456",
      "https://example.com",
      "www.example.com",
      "12345",
    ]) {
      expect(isRecordableTerm(term), term).toBe(false);
    }
  });

  it("keeps 2 to 64 characters only, and at most 5 digits in all", () => {
    expect(isRecordableTerm("a")).toBe(false);
    expect(isRecordableTerm("ab")).toBe(true);
    expect(isRecordableTerm("x".repeat(64))).toBe(true);
    expect(isRecordableTerm("x".repeat(65))).toBe(false);
    expect(isRecordableTerm("a1 b2 c3 d4 e5")).toBe(true);
    expect(isRecordableTerm("a1 b2 c3 d4 e5 f6")).toBe(false);
  });
});

describe("IMEI intent", () => {
  it("computes the Luhn check digit", () => {
    expect(luhnDigit("49015420323751")).toBe(8);
    expect(luhnDigit("35693803564380")).toBe(9);
  });

  it("recognises 15 digits with a valid check digit, whatever the separators", () => {
    expect(imeiFromQuery("356938035643809")).toBe("356938035643809");
    expect(imeiFromQuery("3569 3803 5643 809")).toBe("356938035643809");
    expect(imeiFromQuery("35-693803-564380-9")).toBe("356938035643809");
    expect(imeiFromQuery("35.693803.564380/9")).toBe("356938035643809");
    expect(imeiFromQuery("٣٥٦٩٣٨٠٣٥٦٤٣٨٠٩")).toBe("356938035643809");
  });

  it("refuses a wrong check digit and anything that is not 15 or 16 digits", () => {
    expect(imeiFromQuery("356938035643808")).toBeNull();
    expect(imeiFromQuery("35693803564380")).toBeNull();
    expect(imeiFromQuery("samsung 356938035643809")).toBeNull();
    expect(imeiFromQuery("")).toBeNull();
  });

  it("turns an IMEISV (16 digits) into its IMEI: the first 14 digits and their check digit", () => {
    expect(imeiFromQuery("3569380356438012")).toBe("356938035643809");
  });
});
