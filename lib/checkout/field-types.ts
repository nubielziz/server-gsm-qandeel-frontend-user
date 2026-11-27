// The ten checked field types beyond `imei` (backend decision 076, shop decision 009): how each one is read, judged and drawn.
// ONE table drives both order forms (the retail checkout and the merchant order form), so a buyer sees at once the problem the
// server would report, in the server's sentence (lib/i18n/messages/errors.ts, by the same code). Pure: unit-tested.
//
// The server (backend src/modules/orders/domain/placement-rules.ts, `FIELD_TYPE_RULES`) is the authority: it trims the sent value,
// reads it into its stored form and judges that form. The `read` and `problem` of each row below copy those rules, so what passes
// here passes there. Arabic-Indic and Persian digits are read as Latin ones first (group C: the API only takes Latin digits), as the
// IMEI box has always done; the value sent then holds Latin digits.
import { isValidImei, latinDigits } from "@/lib/format";

/** The most IMEIs one `imei_bulk` value holds (it is one order at one price, never one order per IMEI). */
export const MAX_IMEIS = 30;

/** The ten types this module judges; any other value of `fieldType` is drawn and checked as decision 008 says. */
export const TYPED_FIELD_TYPES = [
  "imei_bulk",
  "imeisv",
  "serial",
  "iccid",
  "eid",
  "meid",
  "ecid",
  "mac_address",
  "mi_lock_code",
  "box_sn",
] as const;

export type TypedFieldType = (typeof TYPED_FIELD_TYPES)[number];

/** The codes of the field errors these types give: the server's own (`invalid_imei` is a line of an `imei_bulk` list here). */
export type TypedCode =
  | "invalid_imei"
  | "too_many_imeis"
  | "duplicate_imei"
  | "invalid_imeisv"
  | "invalid_serial"
  | "invalid_iccid"
  | "invalid_eid"
  | "invalid_meid"
  | "invalid_ecid"
  | "invalid_mac_address"
  | "invalid_mi_lock_code"
  | "invalid_box_sn";

/** The first problem of a value: the server's code, and for a list the line (counted from 1, among the items kept). */
export type TypedProblem = { code: TypedCode; line?: number };

/** What a form draws for a type: a one-line box or a text area, with the hints of the keyboard and the longest typed text. */
export type FieldControl = {
  kind: "line" | "area";
  /** The on-screen keyboard: digits only, or the ordinary one (letters are typed too). */
  inputMode: "numeric" | "text";
  /** Codes are typed in capitals by the server's reading: the keyboard starts in capitals where the stored form is upper case. */
  autoCapitalize: "off" | "characters";
  /** Room for the longest valid value with its spaces, dashes and separators. */
  maxLength: number;
  /** Rows of a text area. */
  rows?: number;
};

type Rule = {
  /** Reads a trimmed value (digits already Latin) into the stored form. */
  read: (text: string) => string;
  /** The first problem of a stored form that is not empty, or null. */
  problem: (value: string) => TypedProblem | null;
  control: FieldControl;
};

const withoutSpaces = (text: string): string => text.replace(/\s/g, "");
/** Spaces and dashes removed: the server's `normalizeImei`. */
const withoutSeparators = (text: string): string => text.replace(/[\s-]/g, "");

/** A problem with a fixed code: valid when the stored form matches `pattern`. */
const fixed =
  (pattern: RegExp, code: TypedCode) =>
  (value: string): TypedProblem | null =>
    pattern.test(value) ? null : { code };

/** The items of a list as typed: split on line breaks, commas and semicolons, each without spaces and dashes, the empty ones dropped. */
function imeiItems(text: string): string[] {
  return text
    .split(/[\r\n,;]/)
    .map(withoutSeparators)
    .filter((item) => item !== "");
}

/**
 * The first problem of a list in its stored form (one IMEI per line): more than `MAX_IMEIS` items, then by line an item that is not a
 * valid IMEI or that repeats an earlier one. A list with no item at all is refused as line 1.
 */
function imeiListProblem(value: string): TypedProblem | null {
  const items = value === "" ? [] : value.split("\n");
  if (items.length > MAX_IMEIS) return { code: "too_many_imeis" };
  if (items.length === 0) return { code: "invalid_imei", line: 1 };
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (!isValidImei(item)) return { code: "invalid_imei", line: index + 1 };
    if (seen.has(item)) return { code: "duplicate_imei", line: index + 1 };
    seen.add(item);
  }
  return null;
}

/** A MAC address as `AA:BB:CC:DD:EE:FF` when it is written in an accepted form (alone, by pairs with ":" or "-", or in groups of four with "."). */
function macAddressOf(text: string): string {
  const accepted =
    /^[0-9A-F]{12}$/i.test(text) ||
    /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/i.test(text) ||
    /^[0-9A-F]{2}(-[0-9A-F]{2}){5}$/i.test(text) ||
    /^[0-9A-F]{4}(\.[0-9A-F]{4}){2}$/i.test(text);
  if (!accepted) return text;
  return (text.replace(/[:.-]/g, "").toUpperCase().match(/.{2}/g) ?? []).join(":");
}

/** An ECID without spaces and upper-cased; a leading `0x` (any case) stays `0x`. */
function ecidOf(text: string): string {
  const compact = withoutSpaces(text);
  return /^0x/i.test(compact) ? `0x${compact.slice(2).toUpperCase()}` : compact.toUpperCase();
}

const line = (inputMode: FieldControl["inputMode"], autoCapitalize: FieldControl["autoCapitalize"], maxLength: number): FieldControl => ({
  kind: "line",
  inputMode,
  autoCapitalize,
  maxLength,
});

const RULES: Readonly<Record<TypedFieldType, Rule>> = {
  imei_bulk: {
    read: (text) => imeiItems(text).join("\n"),
    problem: imeiListProblem,
    // A text area keeps the ordinary keyboard: a numeric pad has no way to start a new line.
    control: { kind: "area", inputMode: "text", autoCapitalize: "off", maxLength: 1000, rows: 6 },
  },
  imeisv: { read: withoutSeparators, problem: fixed(/^\d{16}$/, "invalid_imeisv"), control: line("numeric", "off", 24) },
  serial: {
    read: (text) => withoutSpaces(text).toUpperCase(),
    problem: fixed(/^[A-Z0-9]{5,30}$/, "invalid_serial"),
    control: line("text", "characters", 40),
  },
  iccid: { read: withoutSeparators, problem: fixed(/^89\d{16,20}$/, "invalid_iccid"), control: line("numeric", "off", 32) },
  eid: { read: withoutSeparators, problem: fixed(/^\d{32}$/, "invalid_eid"), control: line("numeric", "off", 48) },
  meid: {
    read: (text) => withoutSeparators(text).toUpperCase(),
    problem: fixed(/^([0-9A-F]{14,15}|\d{18})$/, "invalid_meid"),
    control: line("text", "characters", 32),
  },
  ecid: { read: ecidOf, problem: fixed(/^((0x)?[0-9A-F]{8,16}|\d{8,20})$/, "invalid_ecid"), control: line("text", "characters", 32) },
  mac_address: {
    read: macAddressOf,
    problem: fixed(/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/, "invalid_mac_address"),
    control: line("text", "characters", 24),
  },
  mi_lock_code: { read: (text) => text, problem: fixed(/^[A-Za-z0-9-]{6,64}$/, "invalid_mi_lock_code"), control: line("text", "off", 80) },
  box_sn: {
    read: (text) => withoutSpaces(text).toUpperCase(),
    problem: fixed(/^[A-Z0-9-]{4,32}$/, "invalid_box_sn"),
    control: line("text", "characters", 48),
  },
};

/** True for one of the ten types of this module (`Object.hasOwn`: a type named like an object member is not one). */
export function isTypedFieldType(fieldType: string): fieldType is TypedFieldType {
  return Object.hasOwn(RULES, fieldType);
}

/** The value as the server will store it: trimmed (Arabic-Indic and Persian digits read as Latin ones), then read by the type's row. */
export function typedRead(type: TypedFieldType, typed: string): string {
  return RULES[type].read(latinDigits(typed).trim());
}

/**
 * The first problem of a value the person typed, with the server's code; null when the type accepts it. Call it for a value that is
 * not empty (an empty one follows the field's Required tick). A list reports the line of its first problem.
 */
export function typedProblem(type: TypedFieldType, typed: string): TypedProblem | null {
  return RULES[type].problem(typedRead(type, typed));
}

/**
 * The value a request carries: what was typed, trimmed (Latin digits). The server reads it into its stored form itself; only a list
 * goes out already in that form (one IMEI per line), because 30 IMEIs typed with spaces and commas can pass the 500 characters the
 * request allows, and the server reads the stored form of a list as the same list.
 */
export function typedSent(type: TypedFieldType, typed: string): string {
  return type === "imei_bulk" ? typedRead(type, typed) : latinDigits(typed).trim();
}

/** What a form draws for the type. */
export function typedControl(type: TypedFieldType): FieldControl {
  return RULES[type].control;
}

/** How many IMEIs a typed list holds (empty items dropped): the live count under the text area. */
export function imeiCount(typed: string): number {
  return imeiItems(latinDigits(typed)).length;
}
