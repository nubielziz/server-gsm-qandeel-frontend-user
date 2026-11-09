// Field: label + control + hint + error, with the ids and ARIA wiring done for you.
// Server-compatible. Use it directly with a render-prop child, or let Input / Textarea / Select / PasswordInput wrap
// themselves when you pass them `label`.
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** What a control must spread to be wired to its label, hint and error. */
export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  required?: boolean;
};

/** Props shared by every form control that can wrap itself in a Field. */
export type FieldMessages = {
  /** Visible label. Without it the control renders bare: then give it an `aria-label`. */
  label?: ReactNode;
  /** Help text under the control, linked with aria-describedby. */
  hint?: ReactNode;
  /** Error text. Sets `aria-invalid`, turns the border red and is announced politely. */
  error?: string | undefined;
  /** Marks the control required: a `*` after the label and the native `required` attribute. */
  required?: boolean;
  /** Text appended to the label when the field is optional, e.g. "(optional)". Pass `t.ui.optional`. */
  optionalLabel?: string;
  /** Hides the label visually but keeps it for screen readers. */
  labelHidden?: boolean;
  /** Classes for the wrapper div. */
  fieldClassName?: string;
};

export type FieldProps = FieldMessages & {
  /** Overrides the generated control id (needed when the label must point at a specific element). */
  id?: string;
  /** Receives the props to spread on the control (`id`, `aria-describedby`, `aria-invalid`, `required`). */
  children: (control: FieldControlProps) => ReactNode;
};

/** Wraps a control with its label, hint and error, wired by ids. `children` is a function: `{(p) => <input {...p} />}`. */
export function Field({
  label,
  hint,
  error,
  required,
  optionalLabel,
  labelHidden,
  fieldClassName,
  id: idProp,
  children,
}: FieldProps) {
  const generated = useId();
  const id = idProp ?? `f${generated.replace(/:/g, "")}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("grid gap-1.5", fieldClassName)}>
      <label htmlFor={id} className={cn("text-small font-semibold text-ink", labelHidden && "sr-only")}>
        {label}
        {required ? (
          <span aria-hidden="true" className="ms-0.5 text-danger-ink">
            *
          </span>
        ) : optionalLabel ? (
          <span className="ms-1 font-normal text-ink-subtle">{optionalLabel}</span>
        ) : null}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        required: required || undefined,
      })}
      {hint ? (
        <p id={hintId} className="text-small text-ink-subtle">
          {hint}
        </p>
      ) : null}
      {/* Always rendered so that a screen reader sees the text appear. */}
      <div id={errorId} aria-live="polite">
        {error ? <p className="text-small font-medium text-danger-ink">{error}</p> : null}
      </div>
    </div>
  );
}
