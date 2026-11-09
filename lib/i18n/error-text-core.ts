// Translates ApiErrors by code. Pure and safe anywhere: Server Components call `errorText(errors[locale])`;
// Client Components use `useErrorText()` (lib/i18n/error-text.tsx), which wraps this with the provided messages.
import { isApiError, type ApiError, type FieldError } from "@/lib/api/errors";
import type { ErrorMessages } from "./messages/errors";
import { fmt } from "./define";

export type ErrorText = {
  /** One sentence for the whole error (by `code`). Unknown errors get the generic text. */
  message(error: unknown): string;
  /** Text for one field error (by its `code`). */
  field(error: FieldError | undefined): string | undefined;
  /** `{ fieldPath: text }` for every field error of an ApiError (first error per field). */
  fields(error: unknown): Record<string, string>;
  /** "Reference: <request id>" or undefined, for error screens and support. */
  reference(error: unknown): string | undefined;
};

/** The translator for one language's error texts (`errors[locale]`). */
export function errorText(t: ErrorMessages): ErrorText {
  const codes = t.codes as Record<string, string>;
  const fieldTexts = t.fields as Record<string, string>;
  // Field codes come in both cases from the API (`INVALID_IMEI` as a problem code, `invalid_imei` on a field).
  const fieldText = (code: string) =>
    fieldTexts[code] ?? fieldTexts[code.toLowerCase()] ?? fieldTexts[code.toUpperCase()] ?? fieldTexts.fallback;
  return {
    message(error) {
      if (!isApiError(error)) return codes.fallback;
      let text = codes[error.code] ?? codes.fallback;
      if (error.code === "RATE_LIMITED" && error.retryAfter) text += ` ${fmt(t.retryIn, { seconds: error.retryAfter })}`;
      return text;
    },
    field(error) {
      if (!error) return undefined;
      return fieldText(error.code);
    },
    fields(error) {
      const out: Record<string, string> = {};
      if (!isApiError(error)) return out;
      for (const fe of (error as ApiError).fieldErrors) out[fe.field] ??= fieldText(fe.code);
      return out;
    },
    reference(error) {
      return isApiError(error) && error.requestId ? fmt(t.requestId, { id: error.requestId }) : undefined;
    },
  };
}
