// Pure helpers for the order form (handoff §4.5): checking custom fields (each by its own type and Required tick, a field of
// type `imei` included, decision 008), building the request body and mapping the API's field errors back onto the form.
// No React, no I/O: unit-tested.
import { isValidImei, normalizeImei } from "@/lib/format";
import type { MerchantOrderInput, MerchantServiceDetail } from "@/lib/api/types";
import type { FieldError } from "@/lib/api/errors";
import { fromMerchantRule, isAllowedQuantity, parseQuantityInput, quantityMode } from "@/lib/quantity";
import { sitePath } from "@/lib/site-path";

/** Custom field values are at most 500 characters. */
export const MAX_FIELD_VALUE = 500;

export type ServiceField = MerchantServiceDetail["fields"][number];

// ── Custom fields ──────────────────────────────────────────────────────────────────────────────────────────

export type FieldProblem = "required" | "pattern" | "number" | "tooLong" | "option" | "invalid_imei";

/** A `new RegExp` that never throws: an invalid pattern from the catalog is ignored (the server still checks). */
export function safeRegExp(pattern: string): RegExp | null {
  if (!pattern) return null;
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

/**
 * Checks one custom field the way the API does, by the field's own type and Required tick: required, number, select option,
 * regex, 500 characters. A field of type `imei` is read as digits (spaces and dashes removed): empty follows its Required
 * tick, else it must be 15 digits with a valid check digit (`invalid_imei`) and fit the field's own pattern.
 */
export function checkField(field: ServiceField, value: string): FieldProblem | null {
  if (field.fieldType === "imei") {
    const imei = normalizeImei(value);
    if (imei === "") return field.required ? "required" : null;
    if (!isValidImei(imei)) return "invalid_imei";
    const imeiPattern = safeRegExp(field.regex);
    return imeiPattern && !imeiPattern.test(imei) ? "pattern" : null;
  }
  const text = value.trim();
  if (text === "") return field.required ? "required" : null;
  if (text.length > MAX_FIELD_VALUE) return "tooLong";
  if (field.fieldType === "number" && !/^-?\d+(\.\d+)?$/.test(text)) return "number";
  if (field.fieldType === "select" && field.options.length > 0 && !field.options.includes(text)) return "option";
  const re = safeRegExp(field.regex);
  if (re && !re.test(text)) return "pattern";
  return null;
}

/**
 * `inputs` for the request: only fields with a value, trimmed. The value of a field of type `imei` goes out as digits
 * only, the way the API reads an IMEI; a field that holds nothing (an IMEI box with only dashes, say) is left out.
 */
export function buildInputs(fields: ServiceField[], values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = f.fieldType === "imei" ? normalizeImei(values[f.key] ?? "") : (values[f.key] ?? "").trim();
    if (v !== "") out[f.key] = v;
  }
  return out;
}

// ── Quantity ───────────────────────────────────────────────────────────────────────────────────────────────

export type QuantityRule = { kind: "fixed"; value: number } | { kind: "options"; options: number[] } | { kind: "range"; min: number; max: number };

/**
 * How the quantity is chosen, decided by `quantityMode` of lib/quantity.ts (plan D17, BH §14.2): two or more packs are
 * `options`; one pack, an exact N and "one per order" are `fixed` (nothing to choose); else a `range` from min to max.
 */
export function quantityRule(service: { minQty: number; maxQty: number; qtyOptions: readonly number[] }): QuantityRule {
  const mode = quantityMode(fromMerchantRule(service));
  switch (mode.kind) {
    case "single":
      return { kind: "fixed", value: 1 };
    case "exact":
      return { kind: "fixed", value: mode.value };
    case "packs":
      return { kind: "options", options: mode.options };
    case "range":
      return { kind: "range", min: mode.min, max: mode.max };
  }
}

/** The quantity a form shows first: the fixed one, the smallest pack, or the range's minimum (what the API orders without `quantity`). */
export function defaultQuantityOf(rule: QuantityRule): number {
  return rule.kind === "fixed" ? rule.value : rule.kind === "options" ? rule.options[0] : rule.min;
}

/** Reads a typed quantity (Arabic-Indic and Persian digits too): a whole number the rule accepts, else null. A fixed rule is always its value. */
export function parseQuantity(text: string, rule: QuantityRule): number | null {
  if (rule.kind === "fixed") return rule.value;
  const n = parseQuantityInput(text);
  if (n === null) return null;
  if (rule.kind === "options") return rule.options.includes(n) ? n : null;
  return isAllowedQuantity({ min: rule.min, max: rule.max, options: [] }, n) ? n : null;
}

// ── One submission, one key ────────────────────────────────────────────────────────────────────────────────

/** A JSON text of `value` with object keys sorted at every level (arrays keep their order). */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * The signature of an order request for `createIdempotencyKeys().keyFor()`: equal bodies give the same text whatever
 * the order of their keys, and any change (the IMEI, which is one of the inputs, the quantity, another input, the file)
 * gives another. The same signature keeps the same `Idempotency-Key`, so a retry or a double click replays the first
 * answer; a changed form takes a new key (a reused key with another body is 409 IDEMPOTENCY_KEY_REUSED).
 */
export function orderSignature(body: MerchantOrderInput): string {
  return canonicalJson(body);
}

/** The most `409 IDEMPOTENCY_IN_PROGRESS` waits before the form gives up and lets the person try again (same key). */
export const MAX_IN_PROGRESS_RETRIES = 3;

/** How long to wait after `409 IDEMPOTENCY_IN_PROGRESS`: the `Retry-After` seconds, at least 1 s and at most 10 s. */
export function inProgressWaitMs(retryAfterSeconds: number | undefined): number {
  const seconds = typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 1;
  return Math.min(Math.max(Math.ceil(seconds), 1), 10) * 1000;
}

// ── Where the form leads ───────────────────────────────────────────────────────────────────────────────────

/** The pages the order form and its notices lead to. They are pages of the account area, which every rank shares. */
export type OrderFormHrefs = {
  /** The orders address; an order's own page is `<orderBase>/<id>`, where the form leads once the order is placed. */
  orderBase: string;
  /** The page that adds funds to the wallet (the notice for a balance that is too low). */
  topUp: string;
  /** The shop's services (the way back when a service is switched off). */
  services: string;
};

/** The addresses the order form leads to (it opens at a service's checkout address for a merchant rank, decision 003). */
export function orderFormHrefs(): OrderFormHrefs {
  return {
    orderBase: sitePath("/account/orders"),
    topUp: sitePath("/account/wallet/add-funds"),
    services: sitePath("/services"),
  };
}

/** Where the form goes once the API accepted the order: the order's own page (one order per request, decision 007). */
export function placedHref(order: { id: number }, hrefs: Pick<OrderFormHrefs, "orderBase">): string {
  return `${hrefs.orderBase}/${order.id}`;
}

// ── API field errors → form state ──────────────────────────────────────────────────────────────────────────

export type OrderFieldErrors = {
  quantity?: string;
  fileId?: string;
  /** Per custom field key, from `inputs.<key>` of a field the form draws: a field of type `imei` too (`required`, `invalid_imei`, `pattern`). */
  inputs: Record<string, string>;
  /**
   * Every error the form has no box for: `serviceId`, `body`, a path of an older API such as `imei`, an `inputs.<key>` the form does
   * not list (`unknown_field`: staff removed or renamed the field while the page was open) and a `fileId` on a service that takes
   * no file.
   */
  other: string[];
};

/** What the form draws a box for: the keys of the custom fields it lists, and whether it has the file box. The quantity always has a place. */
export type DrawnBoxes = { inputKeys: ReadonlySet<string>; file: boolean };

/**
 * Maps `errors[]` of a 422 onto the boxes the form draws. An error with no box is an `other` error, so it can be said, never
 * dropped and never left as "check the highlighted fields" with nothing highlighted. `text` turns one error into the person's language.
 */
export function mapOrderFieldErrors(errors: FieldError[], drawn: DrawnBoxes, text: (error: FieldError) => string): OrderFieldErrors {
  const out: OrderFieldErrors = { inputs: {}, other: [] };
  for (const e of errors) {
    const message = text(e);
    const key = e.field.startsWith("inputs.") ? e.field.slice("inputs.".length) : null;
    if (e.field === "quantity") out.quantity ??= message;
    else if (e.field === "fileId" && drawn.file) out.fileId ??= message;
    else if (key !== null && drawn.inputKeys.has(key)) out.inputs[key] ??= message;
    else out.other.push(message);
  }
  return out;
}

/** True when some error belongs to a box the form draws (the quantity, the file or a field); the `other` ones have none. */
export function hasFieldErrors(e: OrderFieldErrors): boolean {
  return Boolean(e.quantity || e.fileId || Object.keys(e.inputs).length);
}
