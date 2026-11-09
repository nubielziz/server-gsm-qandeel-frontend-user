"use client";
// Translates ApiErrors in Client Components. The root layout provides the current language's error texts once;
// forms call `useErrorText()` to get a message for a whole error and per field. Server Components use
// `errorText(errors[locale])` from ./error-text-core instead (a "use client" module cannot serve them).
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
