// One custom field of a checked type (decision 009), drawn by the table of lib/checkout/field-types.ts: the retail checkout drawer
// and the merchant order form both draw it here, so a type looks and behaves the same in both. A one-line box (or, for a list of
// IMEIs, a text area of six rows) with the keyboard hints of its type, a line under it that says what to type, and for a list a
// live count. Left to right, no spell check: these are codes. Colours come from the form components' tokens only.
import { Input, Textarea } from "@/components/ui/input";
import { imeiCount, MAX_IMEIS, typedControl, type TypedFieldType } from "@/lib/checkout/field-types";
import { plural, type PluralForms } from "@/lib/i18n/define";

export type TypedFieldProps = {
  type: TypedFieldType;
  /** `fieldTypes` of lib/i18n/messages/field-types.ts: the hint of each type and the count of a list. */
  labels: { hints: Record<TypedFieldType, string>; count: PluralForms };
  name: string;
  /** The id of the control, when the form moves the focus to it. */
  id?: string;
  label: string;
  required: boolean;
  optionalLabel?: string;
  value: string;
  onChange: (value: string) => void;
  /** The text shown under the box when the value is refused (the form's, or the server's). */
  error?: string;
};

export function TypedField({ type, labels, name, id, label, required, optionalLabel, value, onChange, error }: TypedFieldProps) {
  const control = typedControl(type);
  const count = type === "imei_bulk" ? imeiCount(value) : 0;
  const hint =
    count > 0 ? (
      <>
        {labels.hints[type]}{" "}
        <span className={count > MAX_IMEIS ? "num font-semibold text-danger-ink" : "num font-semibold text-ink"}>{plural(count, labels.count)}</span>
      </>
    ) : (
      labels.hints[type]
    );
  const common = {
    id,
    name,
    label,
    required,
    optionalLabel,
    error,
    hint,
    value,
    autoCapitalize: control.autoCapitalize,
    autoComplete: "off",
    spellCheck: false,
    maxLength: control.maxLength,
    dir: "ltr" as const,
  };
  if (control.kind === "area") {
    return <Textarea {...common} rows={control.rows} onChange={(event) => onChange(event.target.value)} />;
  }
  return <Input {...common} inputMode={control.inputMode} onChange={(event) => onChange(event.target.value)} />;
}
