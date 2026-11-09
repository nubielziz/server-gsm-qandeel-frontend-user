"use client";
// Moves focus to the first invalid field (or the form-level error) whenever a form gets new feedback after a submit.
import { useEffect, type RefObject } from "react";
import { focusFirstError } from "./focus-first-error";
import type { FormFeedback } from "./form-errors";

export function useFocusOnFeedback(feedback: FormFeedback, root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (feedback.message || Object.keys(feedback.fields).length > 0) focusFirstError(root.current);
  }, [feedback, root]);
}
