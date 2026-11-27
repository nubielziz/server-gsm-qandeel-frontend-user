import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { errorText } from "@/lib/i18n/error-text-core";
import { checkout } from "@/lib/i18n/messages/checkout";
import { errors } from "@/lib/i18n/messages/errors";
import { SUMMARY_MAX, fieldIssue, fieldProblem, issueText, sentValue, summaryValue, type CheckoutField } from "./field-check";

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

// ── The ten checked types of decision 009: the rules themselves are tested in field-types.test.ts; here is what the drawer does with them.
describe("fieldProblem and fieldIssue on a field of a checked type", () => {
  const typed = (fieldType: string, over: Partial<CheckoutField> = {}) => field({ fieldType, required: true, ...over });
  const IMEI_A = "490154203237518";
  const IMEI_B = "356938035643809";

  it("follows the Required tick when the value is empty, like any field", () => {
    for (const fieldType of ["imei_bulk", "imeisv", "serial", "iccid", "eid", "meid", "ecid", "mac_address", "mi_lock_code", "box_sn"]) {
      expect(fieldProblem(typed(fieldType), "  "), fieldType).toBe("required");
      expect(fieldProblem(typed(fieldType, { required: false }), ""), fieldType).toBeNull();
    }
  });

  it("refuses a bad value with the server's code, also when the field is optional, and accepts a good one", () => {
    expect(fieldProblem(typed("imeisv"), "123")).toBe("invalid_imeisv");
    expect(fieldProblem(typed("imeisv", { required: false }), "123")).toBe("invalid_imeisv");
    expect(fieldProblem(typed("imeisv"), "3569380356438091")).toBeNull();
    expect(fieldProblem(typed("serial"), "AB")).toBe("invalid_serial");
    expect(fieldProblem(typed("serial"), "f2lxk1abcd")).toBeNull();
    expect(fieldProblem(typed("iccid"), "8901")).toBe("invalid_iccid");
    expect(fieldProblem(typed("eid"), "1".repeat(31))).toBe("invalid_eid");
    expect(fieldProblem(typed("meid"), "zz")).toBe("invalid_meid");
    expect(fieldProblem(typed("ecid"), "12")).toBe("invalid_ecid");
    expect(fieldProblem(typed("mac_address"), "aa:bb")).toBe("invalid_mac_address");
    expect(fieldProblem(typed("mac_address"), "aa-bb-cc-dd-ee-ff")).toBeNull();
    expect(fieldProblem(typed("mi_lock_code"), "abc")).toBe("invalid_mi_lock_code");
    expect(fieldProblem(typed("box_sn"), "a")).toBe("invalid_box_sn");
  });

  it("a value of only dashes is not empty for these types (the server calls only white space empty)", () => {
    expect(fieldProblem(typed("eid", { required: false }), " - - ")).toBe("invalid_eid");
  });

  it("names the first bad line of a list of IMEIs", () => {
    expect(fieldIssue(typed("imei_bulk"), `${IMEI_A}\n${IMEI_B}`)).toBeNull();
    expect(fieldIssue(typed("imei_bulk"), `${IMEI_A}\n123`)).toEqual({ check: "invalid_imei", line: 2 });
    expect(fieldIssue(typed("imei_bulk"), `${IMEI_A}\n${IMEI_A}`)).toEqual({ check: "duplicate_imei", line: 2 });
    expect(fieldIssue(typed("imei_bulk"), "1\n".repeat(31))).toEqual({ check: "too_many_imeis" });
    expect(fieldProblem(typed("imei_bulk"), "123")).toBe("invalid_imei");
  });

  it("a type this code does not know is judged by its Required tick alone, as before (decision 008)", () => {
    expect(fieldProblem(typed("future_type"), "anything")).toBeNull();
    expect(fieldProblem(typed("future_type"), " ")).toBe("required");
  });
});

describe("sentValue and summaryValue on a field of a checked type", () => {
  const typed = (fieldType: string) => field({ fieldType, required: true });

  it("sends what was typed, trimmed, and leaves out a field that holds nothing", () => {
    expect(sentValue(typed("serial"), "  f2lxk 1abcd ")).toBe("f2lxk 1abcd");
    expect(sentValue(typed("mac_address"), " aa-bb-cc-dd-ee-ff ")).toBe("aa-bb-cc-dd-ee-ff");
    expect(sentValue(typed("iccid"), "8901 2601")).toBe("8901 2601");
    expect(sentValue(typed("serial"), "   ")).toBeNull();
  });

  it("sends a list in its stored form, one IMEI per line", () => {
    expect(sentValue(typed("imei_bulk"), " 490154203237518 , 4901-5420 3237-518;\n356938035643809 ")).toBe(
      "490154203237518\n490154203237518\n356938035643809",
    );
  });

  it("reads Arabic-Indic digits as Latin ones in what it sends", () => {
    expect(sentValue(typed("imeisv"), "\u0663\u0665\u0666\u0669\u0663\u0668\u0660\u0663\u0665\u0666\u0664\u0663\u0668\u0660\u0669\u0661")).toBe("3569380356438091");
  });

  it("shows the value as typed on the summary line", () => {
    expect(summaryValue(typed("serial"), "  f2lxk1abcd ")).toBe("f2lxk1abcd");
    expect(summaryValue(typed("mac_address"), "aa-bb-cc-dd-ee-ff")).toBe("aa-bb-cc-dd-ee-ff");
  });
});

describe("issueText: what the buyer reads under the box", () => {
  const text = errorText(errors);
  const drawer = checkout.start.drawer;
  const issue = (field: CheckoutField, value: string) => fieldIssue(field, value)!;
  const typed = (fieldType: string): CheckoutField => field({ fieldType, required: true });

  it("keeps the drawer's own words for a missing value and for an imei", () => {
    expect(issueText({ check: "required" }, drawer, text)).toBe(drawer.errorRequired);
    expect(issueText(issue(imei(), "123"), drawer, text)).toBe(drawer.errorLength);
    expect(issueText(issue(imei(), "490154203237519"), drawer, text)).toBe(drawer.errorChecksum);
  });

  it("says, for each checked type, the sentence the server gives for the same code", () => {
    const expected: Array<[string, string, string]> = [
      ["imeisv", "123", "This IMEISV is not valid: it must be 16 digits."],
      ["serial", "AB", "This serial number is not valid: 5 to 30 letters and digits."],
      ["iccid", "8901", "This ICCID is not valid: 18 to 22 digits, starting with 89."],
      ["eid", "123", "This EID is not valid: it must be 32 digits."],
      ["meid", "123", "This MEID is not valid: 14 hexadecimal characters (0-9, A-F), or 18 digits."],
      ["ecid", "12", "This ECID is not valid: 8 to 16 hexadecimal characters, or up to 20 digits."],
      ["mac_address", "aa:bb", "This MAC address is not valid: 12 hexadecimal characters, like AA:BB:CC:DD:EE:FF."],
      ["mi_lock_code", "abc", "This Mi lock code is not valid: 6 to 64 letters, digits and dashes."],
      ["box_sn", "a", "This box serial number is not valid: 4 to 32 letters, digits and dashes."],
    ];
    for (const [fieldType, value, sentence] of expected) expect(issueText(issue(typed(fieldType), value), drawer, text), fieldType).toBe(sentence);
  });

  it("says the line of a list, and the limit and the repeat in the server's words", () => {
    const list = typed("imei_bulk");
    expect(issueText(issue(list, "490154203237518\n123"), drawer, text)).toBe(
      "Line 2 is not a valid IMEI: each line must be 15 digits with a correct check digit.",
    );
    expect(issueText(issue(list, "490154203237518\n490154203237518"), drawer, text)).toBe("Line 2 repeats an IMEI of this list.");
    expect(issueText(issue(list, "1\n".repeat(31)), drawer, text)).toBe("Enter at most 30 IMEIs.");
  });

  it("words a refusal of the server the same way as the local check, line included", () => {
    const refused = new ApiError({
      status: 422,
      code: "INVALID_IMEI",
      fieldErrors: [
        {
          field: "inputs.imeis_field",
          code: "invalid_imei",
          message: "Line 3 is not a valid IMEI: each line must be 15 digits with a correct check digit.",
        },
      ],
    });
    expect(text.fields(refused)["inputs.imeis_field"]).toBe("Line 3 is not a valid IMEI: each line must be 15 digits with a correct check digit.");
    expect(text.field(refused.fieldErrors[0])).toBe(issueText({ check: "invalid_imei", line: 3 }, drawer, text));
  });
});
