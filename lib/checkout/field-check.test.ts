import { describe, expect, it } from "vitest";
import { SUMMARY_MAX, fieldProblem, sentValue, summaryValue, type CheckoutField } from "./field-check";

const field = (over: Partial<CheckoutField> = {}): CheckoutField => ({ fieldType: "text", required: false, ...over });
const imei = (over: Partial<CheckoutField> = {}) => field({ fieldType: "imei", required: true, ...over });

describe("fieldProblem", () => {
  it("follows the Required tick of any field when it is empty", () => {
    for (const fieldType of ["text", "number", "select", "textarea", "imei"] as const) {
      expect(fieldProblem(field({ fieldType, required: true }), "  "), fieldType).toBe("required");
      expect(fieldProblem(field({ fieldType, required: false }), ""), fieldType).toBeNull();
    }
  });

  it("an imei field with only spaces and dashes is empty: its Required tick decides", () => {
    expect(fieldProblem(imei(), " - - ")).toBe("required");
    expect(fieldProblem(imei({ required: false }), " - - ")).toBeNull();
  });

  it("an imei field must be 15 digits with a valid check digit, as digits (separators removed)", () => {
    expect(fieldProblem(imei(), "490154203237518")).toBeNull();
    expect(fieldProblem(imei(), "4901 5420-3237 518")).toBeNull();
    expect(fieldProblem(imei(), "\u0664\u0669\u0660\u0661\u0665\u0664\u0662\u0660\u0663\u0662\u0663\u0667\u0665\u0661\u0668")).toBeNull();
    expect(fieldProblem(imei(), "49015420323751")).toBe("length");
    expect(fieldProblem(imei(), "49015420323751x")).toBe("length");
    expect(fieldProblem(imei(), "490154203237519")).toBe("checksum");
  });

  it("a typed value in an optional imei field is still checked", () => {
    expect(fieldProblem(imei({ required: false }), "123")).toBe("length");
  });

  it("any other type is judged by its Required tick alone here (the API checks the rest)", () => {
    expect(fieldProblem(field(), "not an imei")).toBeNull();
    expect(fieldProblem(field({ fieldType: "number" }), "abc")).toBeNull();
  });
});

describe("sentValue", () => {
  it("sends an imei field as digits only", () => {
    expect(sentValue(imei(), " 4901 5420-3237 518 ")).toBe("490154203237518");
    expect(sentValue(imei(), "\u0664\u0669\u0660\u0661\u0665\u0664\u0662\u0660\u0663\u0662\u0663\u0667\u0665\u0661\u0668")).toBe("490154203237518");
  });
  it("sends any other field as typed", () => {
    expect(sentValue(field(), " iPhone 15 ")).toBe(" iPhone 15 ");
    expect(sentValue(field(), "4901 5420-3237 518")).toBe("4901 5420-3237 518");
  });
  it("leaves out a field that holds nothing", () => {
    expect(sentValue(field(), "   ")).toBeNull();
    expect(sentValue(imei(), " - ")).toBeNull();
  });
});

describe("summaryValue", () => {
  it("masks an imei field to its last four digits", () => {
    expect(summaryValue(imei(), "4901 5420-3237 518")).toBe("•••••••••••7518");
  });
  it("shows any other value as typed, whatever the type of the service", () => {
    expect(summaryValue(field(), "  Z3X account 7  ")).toBe("Z3X account 7");
    expect(summaryValue(field({ fieldType: "select" }), "Option B")).toBe("Option B");
    expect(summaryValue(field({ fieldType: "textarea" }), "line one\n  line two")).toBe("line one line two");
    expect(summaryValue(field(), "\u0664\u0669\u0660\u0661")).toBe("\u0664\u0669\u0660\u0661");
  });
  it("cuts a long value and ends it with an ellipsis", () => {
    const long = "x".repeat(SUMMARY_MAX + 20);
    const shown = summaryValue(field(), long);
    expect([...shown]).toHaveLength(SUMMARY_MAX);
    expect(shown.endsWith("…")).toBe(true);
    expect(summaryValue(field(), "x".repeat(SUMMARY_MAX))).toBe("x".repeat(SUMMARY_MAX));
  });
  it("is empty while the field has no value", () => {
    expect(summaryValue(field(), "  ")).toBe("");
    expect(summaryValue(imei(), "")).toBe("");
  });
});
