"use client";
// How a client form shows a failed request: texts under the fields the API named (by error `code`), a banner for
// everything else (with the request reference), and focus on the first invalid control. One hook per form.
import { useCallback, useEffect, useState, type RefObject } from "react";
import { isApiError } from "@/lib/api/errors";
import { useErrorText } from "@/lib/i18n/error-text";
import { Alert } from "@/components/ui/alert";

export type FormProblem = {
  /** `{ fieldPath: text }`: show each under its field and set `error` on the control. */
  fields: Record<string, string>;
  /** A sentence for the whole form (not tied to a field), or null. */
  banner: string | null;
  /** "Reference: <request id>" for support, or undefined. */
  reference: string | undefined;
};

/**
 * @param overrides texts for field error codes the shared error texts do not know (`invalid_ip` …).
 */
export function useFormProblem(overrides: Record<string, string> = {}) {
  const errorText = useErrorText();
  const [problem, setProblem] = useState<FormProblem | null>(null);

  /** Turns a failed call into a problem. `known` lists the field paths the form renders (prefix match). */
  const fail = useCallback(
    (error: unknown, known: string[] = []) => {
      const fields: Record<string, string> = {};
      if (isApiError(error)) {
        for (const fe of error.fieldErrors) fields[fe.field] ??= overrides[fe.code] ?? errorText.field(fe) ?? "";
      }
      const hidden = Object.keys(fields).filter((path) => !known.some((k) => path === k || path.startsWith(`${k}.`)));
      const fieldOnly = isApiError(error) && error.status === 422 && Object.keys(fields).length > 0 && hidden.length === 0;
      setProblem({
        fields,
        banner: fieldOnly ? null : errorText.message(error),
        reference: errorText.reference(error),
      });
    },
    [errorText, overrides],
  );

  /** A problem found in the browser (no request was made). */
  const failFields = useCallback((fields: Record<string, string>) => {
    setProblem({ fields, banner: null, reference: undefined });
  }, []);

  const clear = useCallback(() => setProblem(null), []);

  return { problem, fail, failFields, clear };
}

/** Moves focus to the first invalid control inside `ref` whenever a new problem appears. */
export function useFocusFirstInvalid(ref: RefObject<HTMLElement | null>, problem: FormProblem | null): void {
  useEffect(() => {
    if (!problem || Object.keys(problem.fields).length === 0) return;
    ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [problem, ref]);
}

/** The banner for a problem that is not about one field. Announced as an alert. */
export function ProblemAlert({ problem }: { problem: FormProblem | null }) {
  if (!problem?.banner) return null;
  return (
    <Alert tone="danger">
      {problem.banner}
      {problem.reference ? <span className="num mt-1 block text-small opacity-80">{problem.reference}</span> : null}
    </Alert>
  );
}
