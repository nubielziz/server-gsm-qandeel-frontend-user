import { describe, expect, it } from "vitest";
import { createIdempotencyKeys } from "@/lib/api/idempotency";
import {
  buildInputs,
  checkField,
  checkMainInput,
  defaultQuantityOf,
  hasFieldErrors,
  inProgressWaitMs,
  mainInputOf,
  mapOrderFieldErrors,
  orderFormHrefs,
  orderSignature,
  parseQuantity,
  placedHref,
  quantityRule,
  safeRegExp,
  type ServiceField,
} from "./order-input";

const field = (over: Partial<ServiceField>): ServiceField => ({
  key: "k",
  label: "K",
  fieldType: "text",
  required: false,
  isMainInput: false,
  options: [],
  regex: "",
  ...over,
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

describe("buildInputs", () => {
  // A field keyed imei is not special unless the API flags it.
  const fields = [field({ key: "imei" }), field({ key: "device" })];
  it("sends only filled fields, trimmed", () => {
    expect(buildInputs(fields, { imei: " ", device: " iPhone " })).toEqual({ device: "iPhone" });
  });
  it("sends the main input as digits only, and every other field as typed", () => {
    const values = { imei: " 4901 5420-3237 518 ", device: "iPhone 15" };
    expect(buildInputs(fields, values, "imei")).toEqual({ imei: "490154203237518", device: "iPhone 15" });
    expect(buildInputs(fields, values)).toEqual({ imei: "4901 5420-3237 518", device: "iPhone 15" });
  });
  it("reads an IMEI typed with Arabic-Indic digits as Latin digits", () => {
    expect(buildInputs(fields, { imei: "٤٩٠١٥٤٢٠٣٢٣٧٥١٨" }, "imei")).toEqual({ imei: "490154203237518" });
  });
});

describe("the main input of an IMEI service", () => {
  const imeiField = field({ key: "imei_number", label: "IMEI", required: true, isMainInput: true });
  const device = field({ key: "device" });

  it("is the field flagged isMainInput, whatever its key, on an IMEI service only", () => {
    expect(mainInputOf({ type: "imei", fields: [device, imeiField] })).toBe(imeiField);
    expect(mainInputOf({ type: "server", fields: [device, imeiField] })).toBeNull();
    expect(mainInputOf({ type: "file", fields: [] })).toBeNull();
  });
  it("is null for an IMEI service that has no such field: it cannot be ordered", () => {
    expect(mainInputOf({ type: "imei", fields: [device] })).toBeNull();
    expect(mainInputOf({ type: "imei", fields: [] })).toBeNull();
    // A field keyed imei is not the main input unless the API flags it.
    expect(mainInputOf({ type: "imei", fields: [field({ key: "imei" })] })).toBeNull();
  });
  it("checks the value as it will be sent: required, then the check digit, then the field's own pattern", () => {
    expect(checkMainInput(imeiField, "")).toBe("required");
    expect(checkMainInput(imeiField, "  - ")).toBe("required");
    expect(checkMainInput(imeiField, "49015420323751")).toBe("invalid_imei");
    expect(checkMainInput(imeiField, "490154203237519")).toBe("invalid_imei");
    expect(checkMainInput(imeiField, "490154203237518")).toBeNull();
    expect(checkMainInput(imeiField, "4901 5420-3237 518")).toBeNull();
    expect(checkMainInput(imeiField, "٤٩٠١٥٤٢٠٣٢٣٧٥١٨")).toBeNull();
    expect(checkMainInput({ ...imeiField, regex: "^35\\d{13}$" }, "490154203237518")).toBe("pattern");
    expect(checkMainInput({ ...imeiField, regex: "^49\\d{13}$" }, "4901 5420 3237 518")).toBeNull();
  });
  it("is required even when the field says it is optional", () => {
    expect(checkMainInput({ ...imeiField, required: false }, "")).toBe("required");
  });
});

describe("quantity", () => {
  it("picks the rule from the service", () => {
    expect(quantityRule({ minQty: 1, maxQty: 1, qtyOptions: [] })).toEqual({ kind: "fixed", value: 1 });
    expect(quantityRule({ minQty: 1, maxQty: 50, qtyOptions: [] })).toEqual({ kind: "range", min: 1, max: 50 });
    expect(quantityRule({ minQty: 1, maxQty: 50, qtyOptions: [5, 10] })).toEqual({ kind: "options", options: [5, 10] });
  });
  it("an exact N is fixed: nothing to choose", () => {
    expect(quantityRule({ minQty: 5, maxQty: 5, qtyOptions: [] })).toEqual({ kind: "fixed", value: 5 });
  });
  it("a single pack is fixed at that pack, whatever min and max say", () => {
    expect(quantityRule({ minQty: 10, maxQty: 10, qtyOptions: [10] })).toEqual({ kind: "fixed", value: 10 });
    expect(quantityRule({ minQty: 5, maxQty: 25, qtyOptions: [10] })).toEqual({ kind: "fixed", value: 10 });
    expect(quantityRule({ minQty: 1, maxQty: 1, qtyOptions: [1] })).toEqual({ kind: "fixed", value: 1 });
  });
  it("packs are sorted and listed once", () => {
    expect(quantityRule({ minQty: 5, maxQty: 25, qtyOptions: [25, 5, 10, 10] })).toEqual({ kind: "options", options: [5, 10, 25] });
  });
  it("starts a form at the value the API orders without a quantity", () => {
    expect(defaultQuantityOf({ kind: "fixed", value: 5 })).toBe(5);
    expect(defaultQuantityOf({ kind: "options", options: [5, 10] })).toBe(5);
    expect(defaultQuantityOf({ kind: "range", min: 2, max: 50 })).toBe(2);
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
  it("reads Arabic-Indic digits and refuses anything that is not a whole number", () => {
    const range = { kind: "range", min: 2, max: 50 } as const;
    expect(parseQuantity("١٢", range)).toBe(12);
    expect(parseQuantity(" 7 ", range)).toBe(7);
    for (const bad of ["", "-3", "1e1", "5,0", "abc", "0"]) expect(parseQuantity(bad, range), bad).toBeNull();
  });
});

describe("orderSignature and the Idempotency-Key", () => {
  // The IMEI of an IMEI service is one of the inputs, under the key of its main-input field (decision 007).
  const body = { serviceId: 1, quantity: 5, inputs: { imei: "490154203237518", account: "a@b.c", model: "X" } };
  const withImei = (imei: string) => ({ ...body, inputs: { ...body.inputs, imei } });

  it("is the same for equal bodies, whatever the order of their keys", () => {
    const reordered = { inputs: { model: "X", account: "a@b.c", imei: "490154203237518" }, quantity: 5, serviceId: 1 };
    expect(orderSignature(reordered)).toBe(orderSignature(body));
  });
  it("ignores keys that are undefined, as JSON does", () => {
    expect(orderSignature({ serviceId: 1, inputs: { imei: "490154203237518" }, quantity: undefined })).toBe(
      orderSignature({ serviceId: 1, inputs: { imei: "490154203237518" } }),
    );
  });
  it("changes with the IMEI, the quantity, another input or the file", () => {
    const seen = new Set([
      orderSignature(body),
      orderSignature(withImei("356938035643809")),
      orderSignature({ ...body, quantity: 10 }),
      orderSignature({ ...body, inputs: { ...body.inputs, model: "Y" } }),
      orderSignature({ ...body, fileId: 9 }),
    ]);
    expect(seen.size).toBe(5);
  });
  it("keeps one key while the same submission is retried and takes a new one when the form changes", () => {
    let n = 0;
    const keys = createIdempotencyKeys(() => `key-${++n}`);
    const first = keys.keyFor(orderSignature(body));
    expect(keys.keyFor(orderSignature({ ...body }))).toBe(first); // a double click or a retry
    expect(keys.keyFor(orderSignature(withImei("356938035643809")))).not.toBe(first); // the IMEI changed
    keys.reset(); // after a success
    expect(keys.keyFor(orderSignature(body))).toBe("key-3");
  });
});

describe("inProgressWaitMs", () => {
  it("waits Retry-After seconds, between 1 and 10 s", () => {
    expect(inProgressWaitMs(1)).toBe(1000);
    expect(inProgressWaitMs(4)).toBe(4000);
    expect(inProgressWaitMs(0)).toBe(1000);
    expect(inProgressWaitMs(120)).toBe(10000);
  });
  it("waits one second when the header is missing or not a number", () => {
    expect(inProgressWaitMs(undefined)).toBe(1000);
    expect(inProgressWaitMs(Number.NaN)).toBe(1000);
  });
});

describe("mapOrderFieldErrors", () => {
  const text = (e: { code: string }) => `T:${e.code}`;
  /** The boxes of a form that lists the fields `imei` and `account` and has no file box. */
  const drawn = { inputKeys: new Set(["imei", "account"]), file: false };
  const fileDrawn = { ...drawn, file: true };

  it("puts a problem of the IMEI on its own field: the main input is an input like any other", () => {
    const out = mapOrderFieldErrors(
      [
        { field: "inputs.imei", code: "invalid_imei", message: "" },
        { field: "inputs.account", code: "required", message: "" },
      ],
      drawn,
      text,
    );
    expect(out.inputs).toEqual({ imei: "T:invalid_imei", account: "T:required" });
    expect(out.other).toEqual([]);
    expect(hasFieldErrors(out)).toBe(true);
  });
  it("maps the quantity, and the file when the form draws its box", () => {
    const out = mapOrderFieldErrors(
      [
        { field: "quantity", code: "out_of_range", message: "" },
        { field: "fileId", code: "custom", message: "" },
      ],
      fileDrawn,
      text,
    );
    expect(out.quantity).toBe("T:out_of_range");
    expect(out.fileId).toBe("T:custom");
    expect(out.other).toEqual([]);
    expect(hasFieldErrors(out)).toBe(true);
  });
  it("keeps what the form draws no box for as other messages, so it can be said, not lost", () => {
    const out = mapOrderFieldErrors(
      [
        { field: "body", code: "custom", message: "" },
        { field: "imei", code: "INVALID_IMEI", message: "" },
        { field: "imeis.0", code: "invalid_imei", message: "" },
      ],
      drawn,
      text,
    );
    expect(out.other).toEqual(["T:custom", "T:INVALID_IMEI", "T:invalid_imei"]);
    expect(out.inputs).toEqual({});
    expect(hasFieldErrors(out)).toBe(false);
  });
  it("an input the form does not list (unknown_field: staff removed or renamed it while the page was open) has no box: it is an other error", () => {
    const out = mapOrderFieldErrors([{ field: "inputs.old_name", code: "unknown_field", message: "" }], drawn, text);
    expect(out.inputs).toEqual({});
    expect(out.other).toEqual(["T:unknown_field"]);
    // Nothing is highlighted, so the form must not say "check the highlighted fields".
    expect(hasFieldErrors(out)).toBe(false);
  });
  it("a file error on a service that takes no file has no box: it is an other error", () => {
    const out = mapOrderFieldErrors([{ field: "fileId", code: "custom", message: "" }], drawn, text);
    expect(out.fileId).toBeUndefined();
    expect(out.other).toEqual(["T:custom"]);
    expect(hasFieldErrors(out)).toBe(false);
  });
  it("keeps the other errors that arrive together with errors on drawn boxes", () => {
    const out = mapOrderFieldErrors(
      [
        { field: "inputs.account", code: "required", message: "" },
        { field: "inputs.gone", code: "unknown_field", message: "" },
        { field: "serviceId", code: "custom", message: "" },
      ],
      drawn,
      text,
    );
    expect(out.inputs).toEqual({ account: "T:required" });
    expect(out.other).toEqual(["T:unknown_field", "T:custom"]);
    expect(hasFieldErrors(out)).toBe(true);
  });
});

describe("where the order form leads", () => {
  it("every address is a page of the account area or the shop's services, none is under the old portal folder", () => {
    const hrefs = orderFormHrefs();
    expect(hrefs).toEqual({
      orderBase: "/en/account/orders",
      topUp: "/en/account/wallet/add-funds",
      services: "/en/services",
      support: "/en/support",
    });
    for (const href of Object.values(hrefs)) expect(href).not.toContain("/merchant");
  });

  it("after an order the form links to that order's page in the account area", () => {
    expect(placedHref({ id: 42 }, orderFormHrefs())).toBe("/en/account/orders/42");
  });
});
