"use client";
// FormAlert: the form-level error under a submit button. Announced at once (role="alert"), focusable so a failed submit
// can move focus here (focus-first-error.ts), and it carries the request reference for support.
import type { Ref } from "react";
import { Alert } from "@/components/ui/alert";

export type FormAlertProps = {
  message: string | null;
  reference?: string | null;
  tone?: "danger" | "warning";
  ref?: Ref<HTMLDivElement>;
  className?: string;
};

/** Renders nothing without a message. */
export function FormAlert({ message, reference, tone = "danger", ref, className }: FormAlertProps) {
  if (!message) return null;
  return (
    <Alert ref={ref} tone={tone} data-form-error="" tabIndex={-1} className={className}>
      <span>{message}</span>
      {reference ? <span className="num mt-1 block text-small opacity-80">{reference}</span> : null}
    </Alert>
  );
}
