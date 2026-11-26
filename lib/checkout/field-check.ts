// What the shop's details drawer does with the value of one custom field (decision 008). Pure, so the rules are unit-tested: every
// field is judged by its own type and Required tick whatever the type of the service; a field of type `imei` holds one IMEI.
import type { StoreServiceDetail } from "@/lib/api/types";
import { imeiProblem, maskImei, normalizeImei } from "@/lib/format";

/** The part of a field of `StoreServiceDetail.fields` that these rules read. */
export type CheckoutField = Pick<StoreServiceDetail["fields"][number], "fieldType" | "required">;

/** What is wrong with a field's value: empty but required, or (type `imei`) not 15 digits, or a check digit that does not match. */
export type FieldCheck = "required" | "length" | "checksum";

/** The longest value the summary line shows; a longer one is cut and ends with "…". */
export const SUMMARY_MAX = 40;

/**
 * The value of a field as the request sends it: an `imei` field as digits only (spaces and dashes removed, Arabic-Indic and
 * Persian digits read as Latin ones), any other as typed. Null when the field is empty, which is then left out of `inputs`.
 */
export function sentValue(field: Pick<CheckoutField, "fieldType">, value: string): string | null {
  const sent = field.fieldType === "imei" ? normalizeImei(value) : value;
  return sent.trim() === "" ? null : sent;
}

/**
 * The local check of one field before the session is opened (the API checks again): an empty field follows its Required tick,
 * like any field; a field of type `imei` that has a value must be 15 digits with a valid check digit; any other value is
 * the API's to judge.
 *
 * @returns the problem, or null when the field is fine
 */
export function fieldProblem(field: CheckoutField, value: string): FieldCheck | null {
  if (sentValue(field, value) === null) return field.required ? "required" : null;
  return field.fieldType === "imei" ? imeiProblem(value) : null;
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
