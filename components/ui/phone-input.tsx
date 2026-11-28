"use client";
// PhoneInput: the phone field of a form. One text box (`type="tel"`, the value is the string the person typed), with a button
// at its start that shows the flag of the number's country and opens the list of calling codes (CountryList: search by name or by
// code). The flag follows what is typed: `+962…` or `00962…` shows Jordan, a local number or an empty box shows a globe. Choosing
// a country writes its calling code before the number (`withCountry`: an old code is replaced, a local number loses its leading 0
// where that is how the country dials) and puts the caret back in the box. Where several countries share a code (+1, +7, +44) and
// the number cannot tell yet, the country chosen in this list decides, else `countryHint` (the form's own country field).
// Nothing is checked here and no digit is rewritten: the form and the server judge the number, and digits typed on an Arabic
// keyboard stay as typed (they are read, never replaced: group C). The button only works once the script has loaded.
import { useId, useRef, useState, type ComponentProps } from "react";
import { ChevronDown, Globe } from "lucide-react";
import { cn } from "@/lib/cn";
import { dialCountryOptions, dialLabel, phoneCountry, withCountry } from "@/lib/phone/dial";
import { useMounted } from "@/lib/use-mounted";
import { CountryList } from "./country-list";
import { Field, type FieldControlProps, type FieldMessages } from "./field";
import { Flag } from "./flag";
import { controlClasses } from "./input";
import { useAnchoredPopover } from "./use-anchored-popover";
import { useUiText } from "./ui-text";

export type PhoneInputProps = Omit<ComponentProps<"input">, "size" | "type" | "dir" | "value" | "onChange"> &
  FieldMessages & {
    /** The number as typed. */
    value: string;
    onValueChange: (value: string) => void;
    /** The country chosen elsewhere in the form (an ISO code): it breaks the tie between countries that share a calling code. */
    countryHint?: string;
  };

/** A phone box with a flag and a list of calling codes. Controlled: pass `value` and `onValueChange`. */
export function PhoneInput({
  label,
  hint,
  error,
  required,
  optionalLabel,
  labelHidden,
  fieldClassName,
  id,
  value,
  onValueChange,
  countryHint,
  className,
  disabled,
  ...props
}: PhoneInputProps) {
  const ui = useUiText();
  const mounted = useMounted();
  const base = useId().replace(/:/g, "");
  const panelId = `ph${base}`;
  const listId = `${panelId}-list`;
  const buttonId = `${panelId}-code`;
  const input = useRef<HTMLInputElement>(null);
  // How many times the panel opened: each opening mounts a fresh list.
  const [opens, setOpens] = useState(0);
  // The country last chosen in the list: the first tie-breaker of a shared calling code.
  const [picked, setPicked] = useState<string | null>(null);
  const { anchor, panel, open, hide, onBeforeToggle, onToggle } = useAnchoredPopover<HTMLDivElement>({
    minWidth: 288,
    maxHeight: 344,
    onOpenChange: (open) => {
      if (open) setOpens((count) => count + 1);
    },
  });

  const country = phoneCountry(value, picked ?? countryHint);
  const code = country ? dialLabel(country) : null;

  function choose(next: string) {
    setPicked(next);
    onValueChange(withCountry(value, next));
    hide();
    // After the new value is drawn: the caret goes to the end of the box, ready for the number.
    requestAnimationFrame(() => {
      const box = input.current;
      if (!box) return;
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    });
  }

  const control = (wiring: Partial<FieldControlProps>) => (
    <div ref={anchor} dir="ltr" className="relative flex items-center">
      <button
        type="button"
        id={buttonId}
        aria-label={code ? `${ui.callingCode}: ${code}` : ui.callingCode}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        popoverTarget={mounted ? panelId : undefined}
        className={
          "absolute inset-y-px start-px z-10 flex w-[4.25rem] items-center justify-center gap-1.5 border-e border-line " +
          "rounded-s-[calc(var(--radius-control)-1px)] text-ink-muted transition-colors duration-(--duration-fast) " +
          "hover:bg-surface-muted disabled:pointer-events-none"
        }
      >
        {country ? <Flag code={country} /> : <Globe aria-hidden="true" className="size-5 text-ink-subtle" />}
        <ChevronDown aria-hidden="true" className={cn("size-3.5 text-ink-subtle transition-transform", open && "rotate-180")} />
      </button>
      <input
        autoComplete="tel"
        inputMode="tel"
        {...wiring}
        {...props}
        ref={input}
        type="tel"
        dir="ltr"
        aria-invalid={wiring["aria-invalid"] ?? (error ? true : undefined)}
        disabled={disabled}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(controlClasses, "h-11 ps-20", className)}
      />
      <div
        ref={panel}
        id={panelId}
        popover="auto"
        onBeforeToggle={onBeforeToggle}
        onToggle={onToggle}
        className="popover-menu overflow-hidden p-0"
      >
        {opens > 0 ? (
          <CountryList
            key={opens}
            id={listId}
            labelledBy={buttonId}
            // The names are the browser's own English ones; the list is never in the server HTML, so nothing can differ.
            rows={dialCountryOptions()}
            selected={country ?? undefined}
            onSelect={choose}
            onTab={hide}
          />
        ) : null}
      </div>
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
