"use client";
// Generic strings that Client Components in components/ui need (close, show password, copied …). Layouts mount
// <UiTextProvider messages={t.ui}> once with the current language; without a provider the English defaults apply.
import { createContext, use, type ReactNode } from "react";

export type UiText = {
  close: string;
  dismiss: string;
  loading: string;
  optional: string;
  required: string;
  showPassword: string;
  hidePassword: string;
  copy: string;
  copied: string;
  menu: string;
};

const defaults: UiText = {
  close: "Close",
  dismiss: "Dismiss notification",
  loading: "Loading",
  optional: "(optional)",
  required: "required",
  showPassword: "Show password",
  hidePassword: "Hide password",
  copy: "Copy",
  copied: "Copied",
  menu: "Menu",
};

const UiTextContext = createContext<UiText>(defaults);

/** Provides the current language's generic UI strings (`common.ui`) to the Client Components below it. */
export function UiTextProvider({ messages, children }: { messages: UiText; children: ReactNode }) {
  return <UiTextContext value={messages}>{children}</UiTextContext>;
}

/** The generic UI strings of the current language (English defaults without a provider). */
export function useUiText(): UiText {
  return use(UiTextContext);
}
