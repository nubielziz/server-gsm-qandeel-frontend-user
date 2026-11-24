// Turns a failed API call into what a form shows: one message per known field plus one form-level message.
// Translation is by error `code` (the API's own text is English only): `useErrorText()` does the lookup.
import { isApiError } from "@/lib/api/errors";
import type { ErrorText } from "@/lib/i18n/error-text";

export type FormFeedback = {
  /** `{ fieldPath: text }` for the fields the form knows. */
  fields: Record<string, string>;
  /** A form-level sentence, or null when every problem belongs to a field. */
  message: string | null;
  /** "Reference: <request id>" for support, or null. */
  reference: string | null;
};

/**
 * `knownFields` are the form's input names: a 422 field error on one of them goes under that input; anything else
 * (or any non-422 failure) becomes the form-level message, so no error is ever swallowed.
 * `fieldOverrides` replaces the text of a field error with a text written for this form.
 */
export function feedbackFrom(
  error: unknown,
  text: ErrorText,
  knownFields: readonly string[],
  fieldOverrides: Record<string, string> = {},
): FormFeedback {
  const fields: Record<string, string> = {};
  let unplaced = false;
  if (isApiError(error) && error.status === 422) {
    const all = text.fields(error);
    for (const [path, message] of Object.entries(all)) {
      if (knownFields.includes(path)) fields[path] = fieldOverrides[path] ?? message;
      else unplaced = true;
    }
    if (error.fieldErrors.length === 0) unplaced = true;
  }
  const hasFields = Object.keys(fields).length > 0;
  const message = hasFields && !unplaced ? null : text.message(error);
  const showReference = !isApiError(error) || error.status >= 500 || error.status === 0 || !hasFields;
  return { fields, message, reference: showReference ? (text.reference(error) ?? null) : null };
}

export const NO_FEEDBACK: FormFeedback = { fields: {}, message: null, reference: null };
