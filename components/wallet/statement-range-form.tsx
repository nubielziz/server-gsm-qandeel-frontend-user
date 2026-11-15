"use client";
// The date range of the customer statement (plan F21): a GET form with a "From" and a "To" date. The range lives in the
// URL (`?from=2026-11-01&to=2026-11-13`), so it can be shared and survives a reload; the server turns the days into
// the API's UTC times. Without JavaScript the form still works as a plain GET form. With it, an empty field is left out
// of the URL, a start after the end is refused here with the message on the "To" field (focus moves there, the field is
// `aria-invalid` and described by the message), and the two fields limit each other's calendar.
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type StatementRangeFormLabels = {
  /** Accessible name of the form (a search landmark). */
  form: string;
  from: string;
  to: string;
  apply: string;
  clear: string;
  /** "The start date must be on or before the end date." */
  invalid: string;
};

export type StatementRangeFormProps = {
  /** The page's own path, language-prefixed. */
  action: string;
  /** The range now in the URL (`YYYY-MM-DD`, "" for no limit). */
  from: string;
  to: string;
  /** The URL held a start after its end: show the message at once. */
  invalid?: boolean;
  /** Where "Clear dates" goes: the page with no range. */
  clearHref: string;
  labels: StatementRangeFormLabels;
};

export function StatementRangeForm({ action, from, to, invalid, clearHref, labels }: StatementRangeFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const toField = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [fromValue, setFromValue] = useState(from);
  const [toValue, setToValue] = useState(to);
  const [error, setError] = useState<string | undefined>(invalid ? labels.invalid : undefined);

  // The URL is the source of truth: after a navigation (apply, clear, back) the fields show what the URL holds.
  const [seen, setSeen] = useState(`${from}|${to}`);
  if (seen !== `${from}|${to}`) {
    setSeen(`${from}|${to}`);
    setFromValue(from);
    setToValue(to);
    setError(invalid ? labels.invalid : undefined);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // ISO dates sort like text.
    if (fromValue && toValue && fromValue > toValue) {
      setError(labels.invalid);
      toField.current?.focus();
      return;
    }
    setError(undefined);
    const params = new URLSearchParams();
    if (fromValue) params.set("from", fromValue);
    if (toValue) params.set("to", toValue);
    const query = params.toString();
    startTransition(() => router.push(query ? `${action}?${query}` : action, { scroll: false }));
  }

  return (
    <form action={action} method="get" role="search" aria-label={labels.form} noValidate onSubmit={onSubmit} className="grid gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <Input
          type="date"
          name="from"
          label={labels.from}
          value={fromValue}
          max={toValue || undefined}
          onChange={(event) => {
            setFromValue(event.target.value);
            setError(undefined);
          }}
          className="min-w-0"
          fieldClassName="w-full sm:w-44"
        />
        <Input
          ref={toField}
          type="date"
          name="to"
          label={labels.to}
          value={toValue}
          min={fromValue || undefined}
          onChange={(event) => {
            setToValue(event.target.value);
            setError(undefined);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className="min-w-0"
          fieldClassName="w-full sm:w-44"
        />
        <div className="flex items-center gap-2">
          <Button type="submit" variant="secondary" loading={pending}>
            {labels.apply}
          </Button>
          {from || to ? (
            <ButtonLink href={clearHref} variant="ghost">
              {labels.clear}
            </ButtonLink>
          ) : null}
        </div>
      </div>
      {/* Always rendered, so a screen reader hears the message appear. */}
      <div id={errorId} aria-live="polite">
        {error ? <p className="text-small font-medium text-danger-ink">{error}</p> : null}
      </div>
    </form>
  );
}
