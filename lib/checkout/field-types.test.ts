// The ten checked field types (decision 009): the rule table the two order forms share. Each row is the server's own rule (backend
// decision 076, `FIELD_TYPE_RULES`), so a value that passes here passes there, with the same code and the same stored form.
import { describe, expect, it } from "vitest";
import {
  MAX_IMEIS,
  TYPED_FIELD_TYPES,
  imeiCount,
  isTypedFieldType,
  typedControl,
  typedProblem,
  typedRead,
  typedSent,
  type TypedFieldType,
} from "./field-types";

const IMEI_A = "490154203237518";
const IMEI_B = "356938035643809";
const IMEI_C = "352099001761481";

/** A valid IMEI for any number: 14 digits and their Luhn check digit. */
function imeiNumber(n: number): string {
  const body = String(10_000_000_000_000 + n);
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let digit = Number(body[i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return body + String((10 - (sum % 10)) % 10);
}

/** What each type accepts and refuses, with the stored form of a good value. Samples follow the table of the backend decision. */
const SAMPLES: Record<
  Exclude<TypedFieldType, "imei_bulk">,
  { code: string; good: Array<[typed: string, stored: string]>; bad: string[] }
> = {
  imeisv: {
    code: "invalid_imeisv",
    good: [
      ["3569380356438091", "3569380356438091"],
      [" 35 69380-35643 8091 ", "3569380356438091"],
    ],
    bad: ["356938035643809", "35693803564380911", "356938035643809A", "3569-3803-5643-80"],
  },
  serial: {
    code: "invalid_serial",
    good: [
      ["F2LXK1ABCD", "F2LXK1ABCD"],
      [" f2lxk 1abcd ", "F2LXK1ABCD"],
      ["ABCDE", "ABCDE"],
      ["A".repeat(30), "A".repeat(30)],
    ],
    bad: ["ABCD", "A".repeat(31), "F2LXK-1ABCD", "F2LXK_1ABCD", "SERIAL#1"],
  },
  iccid: {
    code: "invalid_iccid",
    good: [
      ["8901260123456789012", "8901260123456789012"],
      ["8901 2601-2345 6789 012", "8901260123456789012"],
      ["89" + "1".repeat(16), "89" + "1".repeat(16)],
      ["89" + "1".repeat(20), "89" + "1".repeat(20)],
    ],
    bad: ["89" + "1".repeat(15), "89" + "1".repeat(21), "9001260123456789012", "890126012345678901A"],
  },
  eid: {
    code: "invalid_eid",
    good: [
      ["89049032000001000000012345678901", "89049032000001000000012345678901"],
      ["8904 9032-0000 0100 0000 0123 4567 8901", "89049032000001000000012345678901"],
    ],
    bad: ["8904903200000100000001234567890", "890490320000010000000123456789012", "8904903200000100000001234567890A"],
  },
  meid: {
    code: "invalid_meid",
    good: [
      ["A1000012345678", "A1000012345678"],
      ["a10000 12345678f", "A10000" + "12345678F"],
      ["a1-000012345678", "A1000012345678"],
      ["123456789012345678", "123456789012345678"],
    ],
    bad: ["A10000123456", "A1000012345678FF", "G1000012345678", "12345678901234567", "1234567890123456789"],
  },
  ecid: {
    code: "invalid_ecid",
    good: [
      ["0x1A2B3C4D", "0x1A2B3C4D"],
      ["0X1a2b3c4d5e6f7a8b", "0x1A2B3C4D5E6F7A8B"],
      ["1a2b3c4d", "1A2B3C4D"],
      [" 1A2B 3C4D ", "1A2B3C4D"],
      ["12345678901234567890", "12345678901234567890"],
    ],
    bad: ["1A2B3C4", "0x1A2B3C4", "1A2B3C4D5E6F7A8B9", "0x1A2B3C4D5E6F7A8B9", "123456789012345678901", "0xZZZZZZZZ"],
  },
  mac_address: {
    code: "invalid_mac_address",
    good: [
      ["aabbccddeeff", "AA:BB:CC:DD:EE:FF"],
      ["AA:BB:CC:DD:EE:FF", "AA:BB:CC:DD:EE:FF"],
      ["aa-bb-cc-dd-ee-ff", "AA:BB:CC:DD:EE:FF"],
      ["aabb.ccdd.eeff", "AA:BB:CC:DD:EE:FF"],
    ],
    bad: ["AA:BB:CC:DD:EE", "AA:BB:CC:DD:EE:FF:00", "AA:BB-CC:DD-EE:FF", "aabbccddeef", "GG:BB:CC:DD:EE:FF", "aabb-ccdd-eeff"],
  },
  mi_lock_code: {
    code: "invalid_mi_lock_code",
    good: [
      ["Ab12-Cd34", "Ab12-Cd34"],
      ["  abc123  ", "abc123"],
      ["a".repeat(64), "a".repeat(64)],
    ],
    bad: ["abc12", "a".repeat(65), "abc 123", "abc_123", "abc123!"],
  },
  box_sn: {
    code: "invalid_box_sn",
    good: [
      ["ab12", "AB12"],
      [" Z3X-0001 ", "Z3X-0001"],
      ["a-b c-d", "A-BC-D"],
      ["A".repeat(32), "A".repeat(32)],
    ],
    bad: ["ABC", "A".repeat(33), "AB_12", "AB#12"],
  },
};

describe("the table", () => {
  it("lists the ten types, each with a control, and no other string is one of them", () => {
    expect(TYPED_FIELD_TYPES).toHaveLength(10);
    for (const type of TYPED_FIELD_TYPES) {
      expect(isTypedFieldType(type), type).toBe(true);
      expect(typedControl(type).maxLength, type).toBeGreaterThan(0);
    }
    for (const other of ["text", "number", "select", "textarea", "imei", "", "IMEISV", "constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(isTypedFieldType(other), other).toBe(false);
    }
  });

  it("draws a list of IMEIs as a text area of six rows and every other type as one line", () => {
    expect(typedControl("imei_bulk")).toMatchObject({ kind: "area", rows: 6 });
    for (const type of TYPED_FIELD_TYPES.filter((t) => t !== "imei_bulk")) expect(typedControl(type).kind, type).toBe("line");
  });

  it("gives the keyboard hints of each type: digits get the numeric pad, codes in capitals start in capitals", () => {
    for (const type of ["imeisv", "iccid", "eid"] as const) expect(typedControl(type).inputMode, type).toBe("numeric");
    // A list is typed over several lines: the numeric pad of a phone has no way to start a new line.
    for (const type of ["imei_bulk", "serial", "meid", "ecid", "mac_address", "mi_lock_code", "box_sn"] as const) {
      expect(typedControl(type).inputMode, type).toBe("text");
    }
    for (const type of ["serial", "meid", "ecid", "mac_address", "box_sn"] as const) expect(typedControl(type).autoCapitalize, type).toBe("characters");
    // The Mi lock code is stored as typed: its case is not changed on the way in.
    for (const type of ["imei_bulk", "imeisv", "iccid", "eid", "mi_lock_code"] as const) expect(typedControl(type).autoCapitalize, type).toBe("off");
  });

  it("leaves room for the longest valid value with its separators", () => {
    expect(typedControl("imeisv").maxLength).toBeGreaterThanOrEqual(16 + 3);
    expect(typedControl("iccid").maxLength).toBeGreaterThanOrEqual(22 + 5);
    expect(typedControl("eid").maxLength).toBeGreaterThanOrEqual(32 + 7);
    expect(typedControl("mac_address").maxLength).toBeGreaterThanOrEqual(17);
    expect(typedControl("serial").maxLength).toBeGreaterThanOrEqual(30);
    expect(typedControl("mi_lock_code").maxLength).toBeGreaterThanOrEqual(64);
    expect(typedControl("box_sn").maxLength).toBeGreaterThanOrEqual(32);
    expect(typedControl("imei_bulk").maxLength).toBeGreaterThanOrEqual(30 * 15 + 29 * 2);
  });
});

describe.each(Object.entries(SAMPLES) as Array<[Exclude<TypedFieldType, "imei_bulk">, (typeof SAMPLES)[keyof typeof SAMPLES]]>)(
  "%s",
  (type, sample) => {
    it("accepts a good value and reads it into the server's stored form", () => {
      for (const [typed, stored] of sample.good) {
        expect(typedProblem(type, typed), typed).toBeNull();
        expect(typedRead(type, typed), typed).toBe(stored);
      }
    });

    it(`refuses a bad value with the server's code (${sample.code}) and no line`, () => {
      for (const typed of sample.bad) expect(typedProblem(type, typed), typed).toEqual({ code: sample.code });
    });

    it("sends what was typed, trimmed: the server reads it into the same stored form", () => {
      for (const [typed] of sample.good) expect(typedSent(type, typed), typed).toBe(typed.trim());
    });
  },
);

describe("Arabic-Indic and Persian digits", () => {
  it("are read as Latin digits, so a value typed on an Arabic keyboard passes and is sent in Latin digits", () => {
    // "3569380356438091" in Arabic-Indic digits, then in Persian digits.
    const arabic = "\u0663\u0665\u0666\u0669\u0663\u0668\u0660\u0663\u0665\u0666\u0664\u0663\u0668\u0660\u0669\u0661";
    const persian = "\u06F3\u06F5\u06F6\u06F9\u06F3\u06F8\u06F0\u06F3\u06F5\u06F6\u06F4\u06F3\u06F8\u06F0\u06F9\u06F1";
    for (const typed of [arabic, persian]) {
      expect(typedProblem("imeisv", typed)).toBeNull();
      expect(typedRead("imeisv", typed)).toBe("3569380356438091");
      expect(typedSent("imeisv", typed)).toBe("3569380356438091");
    }
  });
});

describe("imei_bulk", () => {
  it("reads a list into one IMEI per line: split on line breaks, commas and semicolons, spaces and dashes removed, empty items dropped", () => {
    const typed = ` ${IMEI_A}\r\n\n 3569-3803 5643809 ,,${IMEI_C};  \n`;
    expect(typedRead("imei_bulk", typed)).toBe(`${IMEI_A}\n${IMEI_B}\n${IMEI_C}`);
    expect(typedProblem("imei_bulk", typed)).toBeNull();
  });

  it("accepts one IMEI and exactly the most IMEIs", () => {
    expect(typedProblem("imei_bulk", IMEI_A)).toBeNull();
    const thirty = Array.from({ length: MAX_IMEIS }, (_, n) => imeiNumber(n)).join("\n");
    expect(typedProblem("imei_bulk", thirty)).toBeNull();
  });

  it("sends the list in its stored form, so thirty IMEIs typed with separators stay under the 500 characters of a value", () => {
    const thirty = Array.from({ length: MAX_IMEIS }, (_, n) => imeiNumber(n));
    const typed = thirty.join(" , ");
    expect(typed.length).toBeGreaterThan(500);
    const sent = typedSent("imei_bulk", typed);
    expect(sent).toBe(thirty.join("\n"));
    expect(sent.length).toBe(30 * 15 + 29);
    // The server reads the stored form of a list as the same list.
    expect(typedRead("imei_bulk", sent)).toBe(sent);
  });

  it("names the first bad line (counted among the items kept) with invalid_imei", () => {
    expect(typedProblem("imei_bulk", `${IMEI_A}\n\n49015420323751\n${IMEI_B}`)).toEqual({ code: "invalid_imei", line: 2 });
    expect(typedProblem("imei_bulk", `${IMEI_A}, 490154203237519, ${IMEI_B}`)).toEqual({ code: "invalid_imei", line: 2 });
    expect(typedProblem("imei_bulk", `abc\n${IMEI_A}`)).toEqual({ code: "invalid_imei", line: 1 });
    // Only the first problem is reported: line 2 is bad and line 4 repeats line 1.
    expect(typedProblem("imei_bulk", `${IMEI_A}\nnope\n${IMEI_B}\n${IMEI_A}`)).toEqual({ code: "invalid_imei", line: 2 });
  });

  it("names the line that repeats an IMEI of the list with duplicate_imei, whatever the separators between them", () => {
    expect(typedProblem("imei_bulk", `${IMEI_A}\n${IMEI_B}\n${IMEI_A}`)).toEqual({ code: "duplicate_imei", line: 3 });
    expect(typedProblem("imei_bulk", `${IMEI_A}; 4901-5420 3237-518`)).toEqual({ code: "duplicate_imei", line: 2 });
  });

  it("refuses more than thirty IMEIs with too_many_imeis, before it looks at a single line", () => {
    const thirtyOne = Array.from({ length: MAX_IMEIS + 1 }, (_, n) => imeiNumber(n)).join("\n");
    expect(typedProblem("imei_bulk", thirtyOne)).toEqual({ code: "too_many_imeis" });
    // Thirty-one items of which the first is not an IMEI at all: the count wins, as on the server.
    expect(typedProblem("imei_bulk", `nope\n${thirtyOne}`)).toEqual({ code: "too_many_imeis" });
  });

  it("refuses a list that holds only separators as line 1 (the server calls only white space empty)", () => {
    expect(typedProblem("imei_bulk", " , ; - \n")).toEqual({ code: "invalid_imei", line: 1 });
    expect(typedRead("imei_bulk", " , ; - \n")).toBe("");
  });

  it("counts the IMEIs typed so far, empty items dropped, for the live count", () => {
    expect(imeiCount("")).toBe(0);
    expect(imeiCount(" \n , ;")).toBe(0);
    expect(imeiCount(IMEI_A)).toBe(1);
    expect(imeiCount(`${IMEI_A}\n${IMEI_B}, ${IMEI_C}\n`)).toBe(3);
    // Items are counted whether or not they are valid: the count is what the person has typed.
    expect(imeiCount("1\n2\n3")).toBe(3);
  });
});
