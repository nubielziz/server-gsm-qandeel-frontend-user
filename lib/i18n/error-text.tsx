"use client";
// Translates ApiErrors in Client Components. The root layout provides the error texts once;
// forms call `useErrorText()` to get a message for a whole error and per field, and the error page calls
// `useErrorPageText()` for its own strings. Server Components use `errorText(errors[locale])` from ./error-text-core
// instead (a "use client" module cannot serve them).
import { createContext, use, type ReactNode } from "react";
import type { ErrorMessages } from "./messages/errors";
import { errorText, type ErrorText } from "./error-text-core";

export type { ErrorText };

const ErrorTextContext = createContext<ErrorMessages | null>(null);

export function ErrorTextProvider({ messages, children }: { messages: ErrorMessages; children: ReactNode }) {
  return <ErrorTextContext value={messages}>{children}</ErrorTextContext>;
}

export function useErrorText(): ErrorText {
  const t = use(ErrorTextContext);
  if (!t) throw new Error("useErrorText needs <ErrorTextProvider> (app/[lang]/layout.tsx)");
  return errorText(t);
}

/** The strings of the error page (brand bar, title, message, buttons, reference line) in the current language. */
export function useErrorPageText(): ErrorMessages["page"] {
  const t = use(ErrorTextContext);
  if (!t) throw new Error("useErrorPageText needs <ErrorTextProvider> (app/[lang]/layout.tsx)");
  return t.page;
}
