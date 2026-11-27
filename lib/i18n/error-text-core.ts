// Translates ApiErrors by code. Pure and safe anywhere: Server Components call `errorText(errors)`;
// Client Components use `useErrorText()` (lib/i18n/error-text.tsx), which wraps this with the provided messages.
import { isApiError, type ApiError, type FieldError } from "@/lib/api/errors";
import type { ErrorMessages } from "./messages/errors";
import { fmt } from "./define";

export type ErrorText = {
  /** One sentence for the whole error (by `code`). Unknown errors get the generic text. */
  message(error: unknown): string;
  /** Text for one field error (by its `code`). */
  field(error: FieldError | undefined): string | undefined;
  /** The text of a problem on one line of a list of IMEIs (`invalid_imei`, `duplicate_imei`), or undefined for another code. */
  line(code: string, line: number): string | undefined;
  /** `{ fieldPath: text }` for every field error of an ApiError (first error per field). */
  fields(error: unknown): Record<string, string>;
  /** "Reference: <request id>" or undefined, for error screens and support. */
  reference(error: unknown): string | undefined;
};

/**
 * The line a field error names: a problem of a list of IMEIs has a message that starts with "Line N" (backend decision 076);
 * null for any other error.
 */
export function errorLine(error: Pick<FieldError, "message">): number | null {
  const match = /^Line (\d+)\b/.exec(error.message);
  return match ? Number(match[1]) : null;
}

/** The translator for the site's error texts (`errors`, lib/i18n/messages/errors.ts). */
export function errorText(t: ErrorMessages): ErrorText {
  const codes = t.codes as Record<string, string>;
  const fieldTexts = t.fields as Record<string, string>;
  // Field codes come in both cases from the API (`INVALID_IMEI` as a problem code, `invalid_imei` on a field).
  const fieldText = (code: string) =>
    fieldTexts[code] ?? fieldTexts[code.toLowerCase()] ?? fieldTexts[code.toUpperCase()] ?? fieldTexts.fallback;
  // A problem of a list of IMEIs names its line: the API's message starts with "Line N".
  const lineTexts = t.lines as Record<string, string>;
  const lineText = (code: string, line: number) => {
    const template = lineTexts[code] ?? lineTexts[code.toLowerCase()];
    return template === undefined ? undefined : fmt(template, { line });
  };
  const textOf = (error: FieldError | undefined) => {
    if (!error) return undefined;
    const line = errorLine(error);
    return (line === null ? undefined : lineText(error.code, line)) ?? fieldText(error.code);
  };
  // Seconds up to two minutes ("42 s"), then whole minutes rounded up ("about 15 min"): never a shorter wait than the API said.
  const retryText = (seconds: number) =>
    seconds >= 120 ? fmt(t.retryInMinutes, { minutes: Math.ceil(seconds / 60) }) : fmt(t.retryIn, { seconds });
  return {
    message(error) {
      if (!isApiError(error)) return codes.fallback;
      let text = codes[error.code] ?? codes.fallback;
      if (error.code === "RATE_LIMITED" && error.retryAfter) text += ` ${retryText(error.retryAfter)}`;
      return text;
    },
    field: textOf,
    line: lineText,
    fields(error) {
      const out: Record<string, string> = {};
      if (!isApiError(error)) return out;
      for (const fe of (error as ApiError).fieldErrors) out[fe.field] ??= textOf(fe) ?? fieldTexts.fallback;
      return out;
    },
    reference(error) {
      return isApiError(error) && error.requestId ? fmt(t.requestId, { id: error.requestId }) : undefined;
    },
  };
}
