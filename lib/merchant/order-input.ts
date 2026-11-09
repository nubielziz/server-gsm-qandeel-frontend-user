// Pure helpers for the order form (handoff §4.5): reading bulk IMEI lists, checking custom fields, building the
// request body and mapping the API's field errors back onto the form. No React, no I/O: unit-tested.
import { isValidImei, normalizeImei } from "@/lib/format";
import type { MerchantServiceDetail } from "@/lib/api/types";
import type { FieldError } from "@/lib/api/errors";

/** At most this many IMEIs in one bulk order (`imeis` has 1–100 items). */
export const MAX_BULK_IMEIS = 100;
/** Custom field values are at most 500 characters. */
export const MAX_FIELD_VALUE = 500;

export type ServiceField = MerchantServiceDetail["fields"][number];

// ── Bulk IMEI list ─────────────────────────────────────────────────────────────────────────────────────────

export type ImeiLine = {
  /** 1-based line number in the textarea (blank lines count, so it matches what the person sees). */
  line: number;
  /** The text as typed. */
  raw: string;
  /** Spaces and dashes removed, as the API does. */
  imei: string;
  valid: boolean;
  /** Another line already holds the same IMEI. */
  duplicate: boolean;
};

/** Splits the textarea into IMEI lines (blank lines are skipped, numbering is kept). */
export function parseImeiLines(text: string): ImeiLine[] {
  const seen = new Set<string>();
  const out: ImeiLine[] = [];
  text.split(/\r\n|\r|\n/).forEach((raw, index) => {
    if (raw.trim() === "") return;
    const imei = normalizeImei(raw);
    const duplicate = seen.has(imei);
    seen.add(imei);
    out.push({ line: index + 1, raw, imei, valid: isValidImei(imei), duplicate });
  });
  return out;
}

export type ImeiListSummary = {
  count: number;
  invalid: ImeiLine[];
  duplicates: ImeiLine[];
  tooMany: boolean;
  /** Ready to send: at least one IMEI, all valid, no duplicates, within the limit. */
  ok: boolean;
};

export function summarizeImeiLines(lines: ImeiLine[]): ImeiListSummary {
  const invalid = lines.filter((l) => !l.valid);
  const duplicates = lines.filter((l) => l.duplicate);
  const tooMany = lines.length > MAX_BULK_IMEIS;
  return {
    count: lines.length,
    invalid,
    duplicates,
    tooMany,
    ok: lines.length > 0 && invalid.length === 0 && duplicates.length === 0 && !tooMany,
  };
}

// ── Custom fields ──────────────────────────────────────────────────────────────────────────────────────────

export type FieldProblem = "required" | "pattern" | "number" | "tooLong" | "option";

/** A `new RegExp` that never throws: an invalid pattern from the catalog is ignored (the server still checks). */
export function safeRegExp(pattern: string): RegExp | null {
  if (!pattern) return null;
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

/** Checks one custom field the way the API does (required, number, select option, regex, 500 characters). */
export function checkField(field: ServiceField, value: string): FieldProblem | null {
  const text = value.trim();
  if (text === "") return field.required ? "required" : null;
  if (text.length > MAX_FIELD_VALUE) return "tooLong";
  if (field.fieldType === "number" && !/^-?\d+(\.\d+)?$/.test(text)) return "number";
  if (field.fieldType === "select" && field.options.length > 0 && !field.options.includes(text)) return "option";
  const re = safeRegExp(field.regex);
  if (re && !re.test(text)) return "pattern";
  return null;
}

/** The custom fields a person fills in. On an IMEI service the field keyed `imei` is the IMEI itself, so it is not asked twice. */
export function visibleFields(service: Pick<MerchantServiceDetail, "type" | "fields">): ServiceField[] {
  return service.type === "imei" ? service.fields.filter((f) => f.key !== "imei") : service.fields;
}

/** `inputs` for the request: only fields with a value, trimmed. */
export function buildInputs(fields: ServiceField[], values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = (values[f.key] ?? "").trim();
    if (v !== "") out[f.key] = v;
  }
  return out;
}

// ── Quantity ───────────────────────────────────────────────────────────────────────────────────────────────

export type QuantityRule = { kind: "fixed"; value: number } | { kind: "options"; options: number[] } | { kind: "range"; min: number; max: number };

/** How the quantity is chosen: a fixed one, one of `qtyOptions`, or a number from min to max. */
export function quantityRule(service: { minQty: number; maxQty: number; qtyOptions: number[] }): QuantityRule {
  if (service.qtyOptions.length > 0) return { kind: "options", options: service.qtyOptions };
  if (service.minQty >= service.maxQty) return { kind: "fixed", value: service.minQty };
  return { kind: "range", min: service.minQty, max: service.maxQty };
}

/** Reads a typed quantity: a whole number within the rule, else null. */
export function parseQuantity(text: string, rule: QuantityRule): number | null {
  if (rule.kind === "fixed") return rule.value;
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isSafeInteger(n)) return null;
  if (rule.kind === "options") return rule.options.includes(n) ? n : null;
  return n >= rule.min && n <= rule.max ? n : null;
}

// ── API field errors → form state ──────────────────────────────────────────────────────────────────────────

export type OrderFieldErrors = {
  imei?: string;
  /** The `imeis` list as a whole (too many, both `imei` and `imeis` sent …). */
  imeis?: string;
  /** Per textarea line (1-based), from `imeis.N`. */
  lines: Record<number, string>;
  quantity?: string;
  fileId?: string;
  /** Per custom field key, from `inputs.<key>`. */
  inputs: Record<string, string>;
  /** Anything else (`serviceId`, `body` …). */
  other: string[];
};

/**
 * Maps `errors[]` of a 422 onto the form. `lines` are the IMEI lines that were sent, so `imeis.N` (index into the
 * sent array) lands on the right textarea line. `text` turns one error into the person's language.
 */
export function mapOrderFieldErrors(
  errors: FieldError[],
  sentLines: ImeiLine[],
  text: (error: FieldError) => string,
): OrderFieldErrors {
  const out: OrderFieldErrors = { lines: {}, inputs: {}, other: [] };
  for (const e of errors) {
    const message = text(e);
    const bulk = /^imeis\.(\d+)$/.exec(e.field);
    if (e.field === "imei") out.imei ??= message;
    else if (e.field === "imeis") out.imeis ??= message;
    else if (bulk) {
      const line = sentLines[Number(bulk[1])]?.line;
      if (line !== undefined) out.lines[line] ??= message;
      else out.imeis ??= message;
    } else if (e.field === "quantity") out.quantity ??= message;
    else if (e.field === "fileId") out.fileId ??= message;
    else if (e.field.startsWith("inputs.")) out.inputs[e.field.slice("inputs.".length)] ??= message;
    else out.other.push(message);
  }
  return out;
}

export function hasFieldErrors(e: OrderFieldErrors): boolean {
  return Boolean(e.imei || e.imeis || e.quantity || e.fileId || e.other.length || Object.keys(e.lines).length || Object.keys(e.inputs).length);
}
