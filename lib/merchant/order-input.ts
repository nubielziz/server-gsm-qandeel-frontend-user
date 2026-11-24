// Pure helpers for the order form (handoff §4.5): reading bulk IMEI lists, checking custom fields, building the
// request body and mapping the API's field errors back onto the form. No React, no I/O: unit-tested.
import { isValidImei, normalizeImei } from "@/lib/format";
import type { MerchantOrderInput, MerchantServiceDetail } from "@/lib/api/types";
import type { FieldError } from "@/lib/api/errors";
import { fromMerchantRule, isAllowedQuantity, parseQuantityInput, quantityMode } from "@/lib/quantity";
import { sitePath } from "@/lib/site-path";

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

/**
 * The custom fields a person fills in: the fields as the API sends them. On an IMEI service the API already leaves out the
 * field that is the IMEI itself (the form has its own IMEI box), so nothing is filtered here and no key is special.
 */
export function visibleFields(service: Pick<MerchantServiceDetail, "fields">): ServiceField[] {
  return service.fields;
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
 * the order of their keys, and any change (an IMEI, the quantity, one input, the file, the IMEI order of a bulk list)
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
  /** The list of the account's orders (where a bulk order lands). */
  orders: string;
  /** The orders address; an order's own page is `<orderBase>/<id>`. */
  orderBase: string;
  /** The page that adds funds to the wallet (the notice for a balance that is too low). */
  topUp: string;
  /** The shop's services (the way back when a service is switched off). */
  services: string;
};

/** The addresses the order form leads to (it opens at a service's checkout address for a merchant rank, decision 003). */
export function orderFormHrefs(): OrderFormHrefs {
  return {
    orders: sitePath("/account/orders"),
    orderBase: sitePath("/account/orders"),
    topUp: sitePath("/account/wallet/add-funds"),
    services: sitePath("/services"),
  };
}

/** Where the form goes once the API accepted the order: the order's own page for one order, the orders list for a bulk order. */
export function placedHref(orders: readonly { id: number }[], hrefs: Pick<OrderFormHrefs, "orders" | "orderBase">): string {
  return orders.length === 1 ? `${hrefs.orderBase}/${orders[0].id}` : hrefs.orders;
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
