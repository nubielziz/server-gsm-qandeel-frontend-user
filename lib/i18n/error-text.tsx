"use client";
// Translates ApiErrors in Client Components. The root layout provides the current language's error texts once;
// forms call `useErrorText()` to get a message for a whole error and per field.
import { createContext, use, type ReactNode } from "react";
import { isApiError, type ApiError, type FieldError } from "@/lib/api/errors";
import type { ErrorMessages } from "./messages/errors";
import { fmt } from "./define";

const ErrorTextContext = createContext<ErrorMessages | null>(null);

export function ErrorTextProvider({ messages, children }: { messages: ErrorMessages; children: ReactNode }) {
  return <ErrorTextContext value={messages}>{children}</ErrorTextContext>;
}

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

export function useErrorText(): ErrorText {
  const t = use(ErrorTextContext);
  if (!t) throw new Error("useErrorText needs <ErrorTextProvider> (app/[lang]/layout.tsx)");
  return errorText(t);
}

/** Same as `useErrorText()` for code that already holds the messages (Server Components pass `errors[locale]`). */
export function errorText(t: ErrorMessages): ErrorText {
  const codes = t.codes as Record<string, string>;
  const fieldTexts = t.fields as Record<string, string>;
  return {
    message(error) {
      if (!isApiError(error)) return codes.fallback;
      let text = codes[error.code] ?? codes.fallback;
      if (error.code === "RATE_LIMITED" && error.retryAfter) text += ` ${fmt(t.retryIn, { seconds: error.retryAfter })}`;
      return text;
    },
    field(error) {
      if (!error) return undefined;
      return fieldTexts[error.code] ?? fieldTexts.fallback;
    },
    fields(error) {
      const out: Record<string, string> = {};
      if (!isApiError(error)) return out;
      for (const fe of (error as ApiError).fieldErrors) out[fe.field] ??= fieldTexts[fe.code] ?? fieldTexts.fallback;
      return out;
    },
    reference(error) {
      return isApiError(error) && error.requestId ? fmt(t.requestId, { id: error.requestId }) : undefined;
    },
  };
}
