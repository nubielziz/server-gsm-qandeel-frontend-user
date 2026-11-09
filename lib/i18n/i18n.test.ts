import { describe, expect, it } from "vitest";
import { dirOf, isLocale, localePath, switchLocalePath } from "./config";
import { defineMessages, fmt, plural } from "./define";

describe("locale paths", () => {
  it("prefixes and swaps the language segment", () => {
    expect(localePath("ar", "/services")).toBe("/ar/services");
    expect(localePath("en")).toBe("/en");
    expect(switchLocalePath("/en/services/x", "ar")).toBe("/ar/services/x");
    expect(switchLocalePath("/ar", "en")).toBe("/en");
    expect(switchLocalePath("/help", "ar")).toBe("/ar/help");
  });
  it("knows the two languages and their direction", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
  });
});

describe("messages", () => {
  it("fills placeholders and leaves unknown ones", () => {
    expect(fmt("Pay {amount} now {x}", { amount: "$5" })).toBe("Pay $5 now {x}");
  });
  it("uses Arabic plural categories", () => {
    const forms = { zero: "لا خدمات", one: "خدمة واحدة", two: "خدمتان", few: "{count} خدمات", many: "{count} خدمة", other: "{count} خدمة" };
    expect(plural("ar", 0, forms)).toBe("لا خدمات");
    expect(plural("ar", 1, forms)).toBe("خدمة واحدة");
    expect(plural("ar", 2, forms)).toBe("خدمتان");
    expect(plural("ar", 5, forms)).toBe("5 خدمات");
    expect(plural("ar", 11, forms)).toBe("11 خدمة");
    expect(plural("en", 1, { one: "{count} service", other: "{count} services" })).toBe("1 service");
    expect(plural("en", 3, { one: "{count} service", other: "{count} services" })).toBe("3 services");
  });
  it("defineMessages returns both languages", () => {
    const ns = defineMessages({ en: { a: "A", b: { c: "C" } }, ar: { a: "أ", b: { c: "ج" } } });
    expect(ns.ar.b.c).toBe("ج");
  });
});
