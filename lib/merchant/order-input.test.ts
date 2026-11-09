import { describe, expect, it } from "vitest";
import {
  buildInputs,
  checkField,
  mapOrderFieldErrors,
  parseImeiLines,
  parseQuantity,
  quantityRule,
  safeRegExp,
  summarizeImeiLines,
  visibleFields,
  type ServiceField,
} from "./order-input";

const field = (over: Partial<ServiceField>): ServiceField => ({
  key: "k",
  label: "K",
  fieldType: "text",
  required: false,
  options: [],
  regex: "",
  ...over,
});

describe("parseImeiLines", () => {
  it("skips blank lines, keeps the textarea line numbers and strips spaces and dashes", () => {
    const lines = parseImeiLines("490154203237518\n\n356-938-035 643 809\r\n123");
    expect(lines.map((l) => [l.line, l.imei, l.valid])).toEqual([
      [1, "490154203237518", true],
      [3, "356938035643809", true],
      [4, "123", false],
    ]);
  });
  it("flags a repeated IMEI on its second line", () => {
    const lines = parseImeiLines("490154203237518\n4901 5420 3237 518");
    expect(lines.map((l) => l.duplicate)).toEqual([false, true]);
  });
});

describe("summarizeImeiLines", () => {
  it("is ok for valid, unique lines and not for the rest", () => {
    expect(summarizeImeiLines(parseImeiLines("490154203237518\n356938035643809")).ok).toBe(true);
    expect(summarizeImeiLines(parseImeiLines("")).ok).toBe(false);
    expect(summarizeImeiLines(parseImeiLines("490154203237518\n12")).invalid).toHaveLength(1);
    expect(summarizeImeiLines(parseImeiLines("490154203237518\n490154203237518")).ok).toBe(false);
  });
  it("refuses more than 100 lines", () => {
    // 101 distinct valid IMEIs are hard to build: the limit check only needs the count.
    const many = Array.from({ length: 101 }, () => ({ line: 1, raw: "", imei: "", valid: true, duplicate: false }));
    expect(summarizeImeiLines(many).tooMany).toBe(true);
    expect(summarizeImeiLines(many.slice(0, 100)).tooMany).toBe(false);
  });
});

describe("checkField", () => {
  it("requires a value only when required", () => {
    expect(checkField(field({ required: true }), "  ")).toBe("required");
    expect(checkField(field({}), "")).toBeNull();
  });
  it("checks numbers, select options and length", () => {
    expect(checkField(field({ fieldType: "number" }), "12.5")).toBeNull();
    expect(checkField(field({ fieldType: "number" }), "12a")).toBe("number");
    expect(checkField(field({ fieldType: "select", options: ["a", "b"] }), "c")).toBe("option");
    expect(checkField(field({ fieldType: "select", options: ["a", "b"] }), "b")).toBeNull();
    expect(checkField(field({}), "x".repeat(501))).toBe("tooLong");
  });
  it("applies the regex and ignores one that does not compile", () => {
    expect(checkField(field({ regex: "^[A-Z]{3}\\d+$" }), "abc1")).toBe("pattern");
    expect(checkField(field({ regex: "^[A-Z]{3}\\d+$" }), "ABC1")).toBeNull();
    expect(safeRegExp("([")).toBeNull();
    expect(checkField(field({ regex: "([" }), "anything")).toBeNull();
  });
});

describe("visibleFields and buildInputs", () => {
  const fields = [field({ key: "imei" }), field({ key: "device" })];
  it("hides the imei field on IMEI services only", () => {
    expect(visibleFields({ type: "imei", fields }).map((f) => f.key)).toEqual(["device"]);
    expect(visibleFields({ type: "server", fields }).map((f) => f.key)).toEqual(["imei", "device"]);
  });
  it("sends only filled fields, trimmed", () => {
    expect(buildInputs(fields, { imei: " ", device: " iPhone " })).toEqual({ device: "iPhone" });
  });
});

describe("quantity", () => {
  it("picks the rule from the service", () => {
    expect(quantityRule({ minQty: 1, maxQty: 1, qtyOptions: [] })).toEqual({ kind: "fixed", value: 1 });
    expect(quantityRule({ minQty: 1, maxQty: 50, qtyOptions: [] })).toEqual({ kind: "range", min: 1, max: 50 });
    expect(quantityRule({ minQty: 1, maxQty: 50, qtyOptions: [5, 10] })).toEqual({ kind: "options", options: [5, 10] });
  });
  it("parses within the rule", () => {
    const range = { kind: "range", min: 2, max: 10 } as const;
    expect(parseQuantity("5", range)).toBe(5);
    expect(parseQuantity("1", range)).toBeNull();
    expect(parseQuantity("11", range)).toBeNull();
    expect(parseQuantity("2.5", range)).toBeNull();
    expect(parseQuantity("5", { kind: "options", options: [5, 10] })).toBe(5);
    expect(parseQuantity("6", { kind: "options", options: [5, 10] })).toBeNull();
    expect(parseQuantity("", { kind: "fixed", value: 3 })).toBe(3);
  });
});

describe("mapOrderFieldErrors", () => {
  const sent = parseImeiLines("490154203237518\n\n111\n356938035643809");
  const text = (e: { code: string }) => `T:${e.code}`;
  it("puts imeis.N on the textarea line that was sent as item N", () => {
    const out = mapOrderFieldErrors([{ field: "imeis.1", code: "INVALID_IMEI", message: "" }], sent, text);
    expect(out.lines).toEqual({ 3: "T:INVALID_IMEI" });
  });
  it("maps the other fields", () => {
    const out = mapOrderFieldErrors(
      [
        { field: "imei", code: "INVALID_IMEI", message: "" },
        { field: "inputs.account", code: "required", message: "" },
        { field: "quantity", code: "out_of_range", message: "" },
        { field: "fileId", code: "custom", message: "" },
        { field: "imeis", code: "too_big", message: "" },
        { field: "body", code: "custom", message: "" },
      ],
      [],
      text,
    );
    expect(out.imei).toBe("T:INVALID_IMEI");
    expect(out.inputs).toEqual({ account: "T:required" });
    expect(out.quantity).toBe("T:out_of_range");
    expect(out.fileId).toBe("T:custom");
    expect(out.imeis).toBe("T:too_big");
    expect(out.other).toEqual(["T:custom"]);
  });
});
