import { describe, expect, it } from "vitest";
import { createIdempotencyKeys } from "@/lib/api/idempotency";
import { errorText } from "@/lib/i18n/error-text-core";
import { errors } from "@/lib/i18n/messages/errors";
import { merchant } from "@/lib/i18n/messages/merchant";
import {
  buildInputs,
  checkField,
  checkFieldIssue,
  defaultQuantityOf,
  hasFieldErrors,
  inProgressWaitMs,
  mapOrderFieldErrors,
  orderFormHrefs,
  orderSignature,
  parseQuantity,
  placedHref,
  problemMessage,
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
  it("judges a field flagged isMainInput by its own type, like any other", () => {
    const flagged = field({ key: "serial", isMainInput: true, required: true });
    expect(checkField(flagged, "ABC123")).toBeNull();
    expect(checkField(flagged, "")).toBe("required");
    expect(checkField({ ...flagged, required: false }, "")).toBeNull();
    expect(checkField({ ...flagged, fieldType: "number" }, "ABC123")).toBe("number");
  });
});

describe("checkField on a field of type imei", () => {
  const imeiField = field({ key: "imei_number", label: "IMEI", fieldType: "imei", required: true });

  it("follows the field's Required tick when it is empty, spaces and dashes included", () => {
    expect(checkField(imeiField, "")).toBe("required");
    expect(checkField(imeiField, "  - ")).toBe("required");
    expect(checkField({ ...imeiField, required: false }, "")).toBeNull();
    expect(checkField({ ...imeiField, required: false }, " - ")).toBeNull();
  });
  it("reads the value as digits: 15 of them with a valid check digit", () => {
    expect(checkField(imeiField, "49015420323751")).toBe("invalid_imei");
    expect(checkField(imeiField, "490154203237519")).toBe("invalid_imei");
    expect(checkField(imeiField, "49015420323751x")).toBe("invalid_imei");
    expect(checkField(imeiField, "490154203237518")).toBeNull();
    expect(checkField(imeiField, "4901 5420-3237 518")).toBeNull();
    expect(checkField(imeiField, "٤٩٠١٥٤٢٠٣٢٣٧٥١٨")).toBeNull();
  });
  it("checks a typed value even when the field is optional", () => {
    expect(checkField({ ...imeiField, required: false }, "123")).toBe("invalid_imei");
  });
  it("then applies the field's own pattern to the digits", () => {
    expect(checkField({ ...imeiField, regex: "^35\\d{13}$" }, "490154203237518")).toBe("pattern");
    expect(checkField({ ...imeiField, regex: "^49\\d{13}$" }, "4901 5420 3237 518")).toBeNull();
    expect(checkField({ ...imeiField, regex: "([" }, "490154203237518")).toBeNull();
  });
  it("is judged by its type, not by its key, its flag or the service: a text field keyed imei is plain text", () => {
    expect(checkField(field({ key: "imei", required: true, isMainInput: true }), "not an imei")).toBeNull();
  });
});

describe("buildInputs", () => {
  const fields = [field({ key: "imei", fieldType: "imei" }), field({ key: "device" })];
  it("sends only filled fields, trimmed", () => {
    expect(buildInputs(fields, { imei: " ", device: " iPhone " })).toEqual({ device: "iPhone" });
  });
  it("sends a field of type imei as digits only, and every other field as typed", () => {
    const values = { imei: " 4901 5420-3237 518 ", device: "iPhone 15" };
    expect(buildInputs(fields, values)).toEqual({ imei: "490154203237518", device: "iPhone 15" });
  });
  it("leaves out an imei field that holds only separators", () => {
    expect(buildInputs(fields, { imei: " - - ", device: "x" })).toEqual({ device: "x" });
  });
  it("reads an IMEI typed with Arabic-Indic digits as Latin digits", () => {
    expect(buildInputs(fields, { imei: "٤٩٠١٥٤٢٠٣٢٣٧٥١٨" })).toEqual({ imei: "490154203237518" });
  });
  it("does not touch a field keyed imei unless its type is imei, nor a field flagged isMainInput", () => {
    const plain = [field({ key: "imei", isMainInput: true })];
    expect(buildInputs(plain, { imei: "4901 5420-3237 518" })).toEqual({ imei: "4901 5420-3237 518" });
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
  // An IMEI is one of the inputs, under the key of its field of type imei (decision 008).
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

  it("puts a problem of an imei field on its own field, like any other field's", () => {
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
    });
    for (const href of Object.values(hrefs)) expect(href).not.toContain("/merchant");
  });

  it("after an order the form links to that order's page in the account area", () => {
    expect(placedHref({ id: 42 }, orderFormHrefs())).toBe("/en/account/orders/42");
  });
});

// ── The ten checked types of decision 009 (the rules themselves are tested in lib/checkout/field-types.test.ts).
describe("checkField on a field of a checked type", () => {
  const typed = (fieldType: string, over: Partial<ServiceField> = {}) => field({ key: "code", label: "Code", fieldType, required: true, ...over });

  it("follows the field's Required tick when it is empty", () => {
    for (const fieldType of ["imei_bulk", "imeisv", "serial", "iccid", "eid", "meid", "ecid", "mac_address", "mi_lock_code", "box_sn"]) {
      expect(checkField(typed(fieldType), "  "), fieldType).toBe("required");
      expect(checkField(typed(fieldType, { required: false }), ""), fieldType).toBeNull();
    }
  });

  it("refuses a bad value with the server's code and accepts a good one, optional or not", () => {
    expect(checkField(typed("imeisv"), "35693803564380")).toBe("invalid_imeisv");
    expect(checkField(typed("imeisv", { required: false }), "35693803564380")).toBe("invalid_imeisv");
    expect(checkField(typed("imeisv"), "3569 3803-5643 8091")).toBeNull();
    expect(checkField(typed("serial"), "AB")).toBe("invalid_serial");
    expect(checkField(typed("serial"), "f2lxk1abcd")).toBeNull();
    expect(checkField(typed("iccid"), "8901")).toBe("invalid_iccid");
    expect(checkField(typed("eid"), "123")).toBe("invalid_eid");
    expect(checkField(typed("meid"), "123")).toBe("invalid_meid");
    expect(checkField(typed("ecid"), "123")).toBe("invalid_ecid");
    expect(checkField(typed("mac_address"), "aa:bb:cc")).toBe("invalid_mac_address");
    expect(checkField(typed("mac_address"), "aabb.ccdd.eeff")).toBeNull();
    expect(checkField(typed("mi_lock_code"), "abc")).toBe("invalid_mi_lock_code");
    expect(checkField(typed("box_sn"), "x")).toBe("invalid_box_sn");
  });

  it("judges a list of IMEIs by its first problem and names the line", () => {
    const list = typed("imei_bulk");
    expect(checkFieldIssue(list, "490154203237518\n356938035643809")).toBeNull();
    expect(checkFieldIssue(list, "490154203237518\n123")).toEqual({ problem: "invalid_imei", line: 2 });
    expect(checkFieldIssue(list, "490154203237518, 4901-5420-3237-518")).toEqual({ problem: "duplicate_imei", line: 2 });
    expect(checkFieldIssue(list, "1;".repeat(31))).toEqual({ problem: "too_many_imeis" });
    expect(checkField(list, "123")).toBe("invalid_imei");
  });

  it("matches the field's own pattern against the stored form, after the type's rule", () => {
    const mac = typed("mac_address", { regex: "^00:1A:" });
    expect(checkField(mac, "001a2b3c4d5e")).toBeNull();
    expect(checkField(mac, "aabbccddeeff")).toBe("pattern");
    expect(checkField(mac, "nope")).toBe("invalid_mac_address");
    expect(checkField(typed("serial", { regex: "([" }), "ABCDE")).toBeNull();
  });

  it("a type this code does not know is checked like a plain text field", () => {
    expect(checkField(typed("future_type"), "anything")).toBeNull();
    expect(checkField(typed("future_type"), " ")).toBe("required");
  });
});

describe("buildInputs with a field of a checked type", () => {
  const fields = [field({ key: "serial", fieldType: "serial" }), field({ key: "list", fieldType: "imei_bulk" }), field({ key: "sv", fieldType: "imeisv" })];

  it("sends what was typed, trimmed; a list in its stored form, one IMEI per line", () => {
    expect(buildInputs(fields, { serial: " f2lxk 1abcd ", list: " 490154203237518 , 356938035643809;\n", sv: " 3569 3803 5643 8091" })).toEqual({
      serial: "f2lxk 1abcd",
      list: "490154203237518\n356938035643809",
      sv: "3569 3803 5643 8091",
    });
  });

  it("leaves out a field that holds nothing", () => {
    expect(buildInputs(fields, { serial: "  ", list: "\n", sv: "" })).toEqual({});
  });

  it("reads Arabic-Indic digits as Latin ones", () => {
    expect(buildInputs(fields, { sv: "٣٥٦٩٣٨٠٣٥٦٤٣٨٠٩١" })).toEqual({ sv: "3569380356438091" });
  });
});

describe("problemMessage", () => {
  const text = errorText(errors);
  const say = (issue: Parameters<typeof problemMessage>[0]) => problemMessage(issue, merchant.form, text);

  it("keeps the form's own words for its own problems", () => {
    expect(say({ problem: "required" })).toBe(merchant.form.problems.required);
    expect(say({ problem: "number" })).toBe(merchant.form.problems.number);
    expect(say({ problem: "tooLong" })).toBe("Use at most 500 characters.");
    expect(say({ problem: "invalid_imei" })).toBe(merchant.form.imeiBad);
  });

  it("says the API's sentence of the same code for a checked type", () => {
    expect(say({ problem: "invalid_imeisv" })).toBe("This IMEISV is not valid: it must be 16 digits.");
    expect(say({ problem: "invalid_serial" })).toBe("This serial number is not valid: 5 to 30 letters and digits.");
    expect(say({ problem: "invalid_iccid" })).toBe("This ICCID is not valid: 18 to 22 digits, starting with 89.");
    expect(say({ problem: "invalid_eid" })).toBe("This EID is not valid: it must be 32 digits.");
    expect(say({ problem: "invalid_meid" })).toBe("This MEID is not valid: 14 hexadecimal characters (0-9, A-F), or 18 digits.");
    expect(say({ problem: "invalid_ecid" })).toBe("This ECID is not valid: 8 to 16 hexadecimal characters, or up to 20 digits.");
    expect(say({ problem: "invalid_mac_address" })).toBe("This MAC address is not valid: 12 hexadecimal characters, like AA:BB:CC:DD:EE:FF.");
    expect(say({ problem: "invalid_mi_lock_code" })).toBe("This Mi lock code is not valid: 6 to 64 letters, digits and dashes.");
    expect(say({ problem: "invalid_box_sn" })).toBe("This box serial number is not valid: 4 to 32 letters, digits and dashes.");
    expect(say({ problem: "too_many_imeis" })).toBe("Enter at most 30 IMEIs.");
  });

  it("names the line for a list of IMEIs", () => {
    expect(say({ problem: "invalid_imei", line: 4 })).toBe("Line 4 is not a valid IMEI: each line must be 15 digits with a correct check digit.");
    expect(say({ problem: "duplicate_imei", line: 2 })).toBe("Line 2 repeats an IMEI of this list.");
  });
});
