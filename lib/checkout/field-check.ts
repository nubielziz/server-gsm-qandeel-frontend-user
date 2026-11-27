// What the shop's details drawer does with the value of one custom field (decisions 008 and 009). Pure, so the rules are unit-tested:
// every field is judged by its own type and Required tick whatever the type of the service; a field of type `imei` holds one IMEI,
// and a field of one of the ten checked types of lib/checkout/field-types.ts is judged like the server judges it.
import type { StoreServiceDetail } from "@/lib/api/types";
import { imeiProblem, maskImei, normalizeImei } from "@/lib/format";
import type { ErrorText } from "@/lib/i18n/error-text-core";
import { isTypedFieldType, typedProblem, typedSent, type TypedCode } from "./field-types";

/** The part of a field of `StoreServiceDetail.fields` that these rules read. */
export type CheckoutField = Pick<StoreServiceDetail["fields"][number], "fieldType" | "required">;

/**
 * What is wrong with a field's value: empty but required, or (type `imei`) not 15 digits, or a check digit that does not match, or
 * (a checked type) the code the server would answer with.
 */
export type FieldCheck = "required" | "length" | "checksum" | TypedCode;

/** One problem of a field: what is wrong and, for a list of IMEIs, the line (counted from 1). */
export type FieldIssue = { check: FieldCheck; line?: number };

/** The longest value the summary line shows; a longer one is cut and ends with "…". */
export const SUMMARY_MAX = 40;

/**
 * The value of a field as the request sends it: an `imei` field as digits only (spaces and dashes removed, Arabic-Indic and
 * Persian digits read as Latin ones); a field of a checked type as typed, trimmed (a list as one IMEI per line); any other as typed.
 * Null when the field is empty, which is then left out of `inputs`.
 */
export function sentValue(field: Pick<CheckoutField, "fieldType">, value: string): string | null {
  const sent =
    field.fieldType === "imei" ? normalizeImei(value) : isTypedFieldType(field.fieldType) ? typedSent(field.fieldType, value) : value;
  return sent.trim() === "" ? null : sent;
}

/**
 * The local check of one field before the session is opened (the API checks again), with the line of a list problem: an empty field
 * follows its Required tick, like any field; a field of type `imei` that has a value must be 15 digits with a valid check digit; a field
 * of a checked type must pass the same rules as on the server (the first problem is reported); any other value is the API's to judge.
 *
 * @returns the problem, or null when the field is fine
 */
export function fieldIssue(field: CheckoutField, value: string): FieldIssue | null {
  if (isTypedFieldType(field.fieldType)) {
    // The server calls a value empty when it is only white space; a list of separators is then a list without a valid first line.
    if (value.trim() === "") return field.required ? { check: "required" } : null;
    const problem = typedProblem(field.fieldType, value);
    return problem ? { check: problem.code, line: problem.line } : null;
  }
  if (sentValue(field, value) === null) return field.required ? { check: "required" } : null;
  const problem = field.fieldType === "imei" ? imeiProblem(value) : null;
  return problem ? { check: problem } : null;
}

/** The problem of one field without its line (see `fieldIssue`); null when the field is fine. */
export function fieldProblem(field: CheckoutField, value: string): FieldCheck | null {
  return fieldIssue(field, value)?.check ?? null;
}

/** The drawer's own sentences for the three problems of an IMEI and of a missing value (`checkout.start.drawer`). */
export type DrawerIssueLabels = { errorRequired: string; errorLength: string; errorChecksum: string };

/**
 * The sentence shown under a field for a problem: the drawer's own words for a missing value and for an `imei`, the API's sentence of the
 * same code (lib/i18n/messages/errors.ts) for a checked type, so the buyer reads before the request what the server would say.
 */
export function issueText(issue: FieldIssue, drawer: DrawerIssueLabels, errors: Pick<ErrorText, "field" | "line">): string {
  if (issue.check === "required") return drawer.errorRequired;
  if (issue.check === "length") return drawer.errorLength;
  if (issue.check === "checksum") return drawer.errorChecksum;
  return (issue.line === undefined ? undefined : errors.line(issue.check, issue.line)) ?? errors.field({ field: "", code: issue.check, message: "" }) ?? "";
}

/**
 * The text of the summary line of the main-input field: an IMEI is masked to its last four digits, any other value is shown as
 * typed (spaces collapsed, cut at `SUMMARY_MAX` characters). Empty text while the field has no value.
 */
export function summaryValue(field: Pick<CheckoutField, "fieldType">, value: string): string {
  const sent = sentValue(field, value);
  if (sent === null) return "";
  if (field.fieldType === "imei") return maskImei(sent);
  const characters = [...sent.trim().replace(/\s+/g, " ")];
  return characters.length > SUMMARY_MAX ? `${characters.slice(0, SUMMARY_MAX - 1).join("")}…` : characters.join("");
}
