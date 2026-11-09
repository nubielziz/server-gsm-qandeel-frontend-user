// Input, Textarea and Select: styled native controls. Pass `label` / `hint` / `error` and they wrap themselves in a
// <Field>. All are server-compatible and work uncontrolled in plain forms or controlled in client forms.
import type { ComponentProps, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Field, type FieldControlProps, type FieldMessages } from "./field";

type Wiring = Partial<FieldControlProps>;

/** Shared look of text-like controls: 44px, 10px radius, a 3:1 border, 16px text on phones (no iOS zoom). */
export const controlClasses =
  "w-full rounded-control border border-control bg-surface px-3.5 text-base text-ink md:text-body " +
  "placeholder:text-ink-subtle transition-colors duration-(--duration-fast) ease-standard " +
  "hover:border-ink-muted focus-visible:border-ink aria-invalid:border-danger aria-invalid:hover:border-danger " +
  "disabled:cursor-not-allowed disabled:border-line-strong disabled:bg-surface-muted disabled:text-ink-subtle " +
  "read-only:bg-surface-muted";

export type InputProps = Omit<ComponentProps<"input">, "size"> &
  FieldMessages & {
    /** Icon (lucide element) inside the start edge. */
    leading?: ReactNode;
    /** Content inside the end edge (an icon, or a small button such as the password toggle). */
    trailing?: ReactNode;
    /** `md` = 44px (default), `lg` = 52px. */
    inputSize?: "md" | "lg";
    /** Classes for the box around the input and its icons. */
    wrapperClassName?: string;
  };

/** A single-line text input (any `type`) with optional icons and built-in label, hint and error. */
export function Input({
  label,
  hint,
  error,
  required,
  optionalLabel,
  labelHidden,
  fieldClassName,
  leading,
  trailing,
  inputSize = "md",
  wrapperClassName,
  className,
  id,
  dir: dirProp,
  ...props
}: InputProps) {
  // Email, URL and phone values are always left-to-right text, even on an Arabic page. The wrapper follows, so the
  // icons and the padding stay on the right sides.
  const dir = dirProp ?? (props.type === "email" || props.type === "url" || props.type === "tel" ? "ltr" : undefined);
  const control = (wiring: Wiring) => (
    <div dir={dir} className={cn("relative flex items-center", wrapperClassName)}>
      {leading ? (
        <span className="pointer-events-none absolute inset-y-0 start-0 flex w-11 items-center justify-center text-ink-subtle [&_svg]:size-[18px]">
          {leading}
        </span>
      ) : null}
      <input
        {...wiring}
        dir={dir}
        aria-invalid={wiring["aria-invalid"] ?? (error ? true : undefined)}
        className={cn(
          controlClasses,
          inputSize === "lg" ? "h-13 text-body md:text-subheading" : "h-11",
          leading && "ps-11",
          trailing && "pe-11",
          className,
        )}
        {...props}
      />
      {trailing ? <span className="absolute inset-y-0 end-0 flex items-center pe-1 text-ink-subtle">{trailing}</span> : null}
    </div>
  );
  if (!label) return control({ id, "aria-invalid": error ? true : undefined, required });
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      optionalLabel={optionalLabel}
      labelHidden={labelHidden}
      fieldClassName={fieldClassName}
      id={id}
    >
      {control}
    </Field>
  );
}

export type TextareaProps = ComponentProps<"textarea"> & FieldMessages;

/** A multi-line text input (vertical resize) with built-in label, hint and error. */
export function Textarea({
  label,
  hint,
  error,
  required,
  optionalLabel,
  labelHidden,
  fieldClassName,
  className,
  id,
  rows = 4,
  ...props
}: TextareaProps) {
  const control = (wiring: Wiring) => (
    <textarea
      {...wiring}
      aria-invalid={wiring["aria-invalid"] ?? (error ? true : undefined)}
      rows={rows}
      className={cn(controlClasses, "min-h-24 resize-y py-2.5", className)}
      {...props}
    />
  );
  if (!label) return control({ id, "aria-invalid": error ? true : undefined, required });
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      optionalLabel={optionalLabel}
      labelHidden={labelHidden}
      fieldClassName={fieldClassName}
      id={id}
    >
      {control}
    </Field>
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean };

export type SelectProps = Omit<ComponentProps<"select">, "size"> &
  FieldMessages & {
    /** Options to render. Alternatively pass `<option>` children. */
    options?: SelectOption[];
    /** A first, empty, non-selectable option shown until a value is chosen (e.g. "Select a country"). */
    placeholder?: string;
    /** Classes for the box around the select and its chevron. */
    wrapperClassName?: string;
  };

/** A native `<select>` with a custom chevron and built-in label, hint and error. */
export function Select({
  label,
  hint,
  error,
  required,
  optionalLabel,
  labelHidden,
  fieldClassName,
  options,
  placeholder,
  wrapperClassName,
  className,
  id,
  children,
  defaultValue,
  value,
  ...props
}: SelectProps) {
  const control = (wiring: Wiring) => (
    <div className={cn("relative flex items-center", wrapperClassName)}>
      <select
        {...wiring}
        aria-invalid={wiring["aria-invalid"] ?? (error ? true : undefined)}
        className={cn(controlClasses, "h-11 appearance-none pe-10", className)}
        // A placeholder needs an initial empty selection when the caller sets none.
        defaultValue={value === undefined ? (defaultValue ?? (placeholder ? "" : undefined)) : undefined}
        value={value}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute end-3.5 size-4 text-ink-subtle" />
    </div>
  );
  if (!label) return control({ id, "aria-invalid": error ? true : undefined, required });
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      optionalLabel={optionalLabel}
      labelHidden={labelHidden}
      fieldClassName={fieldClassName}
      id={id}
    >
      {control}
    </Field>
  );
}
