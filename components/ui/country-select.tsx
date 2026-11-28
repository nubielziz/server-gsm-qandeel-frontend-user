"use client";
// CountrySelect: the country field of a form. A button shows the chosen country with its flag; it opens a panel with a search box
// and the list (CountryList), so a person types a few letters instead of scrolling some 250 names. It takes the place of the
// native select, and keeps one in the page: a `<select>` that is hidden from sight and from assistive technology carries the
// field's `name`, its options and the browser's autofill (`autoComplete="country"`), so the form's value, a submit before the
// script loads and the server HTML stay those of a plain select. The button is the control a person uses: the label points at
// it, it carries `aria-invalid` and the hint and error ids, and it gets the focus when the form marks the field.
// Keyboard: Enter, Space or an arrow opens the list; a letter opens it with that letter in the search box; Esc closes it.
// The button only works once the script has loaded (`useMounted`), like the form around it.
import { useId, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { useMounted } from "@/lib/use-mounted";
import { CountryList } from "./country-list";
import { Field, type FieldControlProps, type FieldMessages } from "./field";
import { Flag } from "./flag";
import { controlBoxClasses } from "./input";
import { useAnchoredPopover } from "./use-anchored-popover";

export type CountrySelectProps = FieldMessages & {
  /** Overrides the generated id of the button (the label points at it). */
  id?: string;
  /** The field's name (on the hidden select). */
  name?: string;
  /** The chosen country's code, or "" for none. */
  value: string;
  onValueChange: (code: string) => void;
  /** The countries offered, `{ code, name }`, in the order to show. */
  countries: readonly { code: string; name: string }[];
  /** What the button says while no country is chosen. Without it a chosen country cannot be shown as "none". */
  placeholder?: string;
  /** The autofill hint of the hidden select (default `country`). */
  autoComplete?: string;
  disabled?: boolean;
  /** The button's name when the field has no visible label. */
  "aria-label"?: string;
};

/** A searchable country field with flags. Controlled: pass `value` and `onValueChange`. */
export function CountrySelect({
  label,
  hint,
  error,
  required,
  optionalLabel,
  labelHidden,
  fieldClassName,
  id,
  name,
  value,
  onValueChange,
  countries,
  placeholder,
  autoComplete = "country",
  disabled,
  "aria-label": ariaLabel,
}: CountrySelectProps) {
  const mounted = useMounted();
  const base = useId().replace(/:/g, "");
  const panelId = `cs${base}`;
  const listId = `${panelId}-list`;
  // How many times the panel opened: each opening mounts a fresh list (an empty search, the chosen country in sight).
  const [opens, setOpens] = useState(0);
  // The letter that opened the panel from the keyboard: the search box starts with it.
  const [seed, setSeed] = useState("");
  const { anchor, panel, open, show, hide, onBeforeToggle, onToggle } = useAnchoredPopover<HTMLButtonElement>({
    minWidth: 264,
    maxHeight: 344,
    onOpenChange: (open) => {
      if (open) setOpens((count) => count + 1);
      else setSeed("");
    },
  });

  const known = countries.find((country) => country.code === value);
  // A saved country the list no longer offers is still shown, by its code.
  const chosen = known ?? (value ? { code: value, name: value } : null);

  function choose(code: string) {
    onValueChange(code);
    hide();
    anchor.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      show();
      return;
    }
    // A letter typed on the closed button starts a search, as typing on a native select jumps to a name.
    if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey && !open) {
      event.preventDefault();
      setSeed(event.key);
      show();
    }
  }

  const control = (wiring: Partial<FieldControlProps>) => {
    const buttonId = wiring.id ?? `${panelId}-button`;
    return (
      <div className="relative">
        <button
          ref={anchor}
          type="button"
          id={buttonId}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-describedby={wiring["aria-describedby"]}
          aria-invalid={wiring["aria-invalid"] ?? (error ? true : undefined)}
          aria-required={wiring.required}
          aria-label={ariaLabel}
          disabled={disabled}
          popoverTarget={mounted ? panelId : undefined}
          onKeyDown={onKeyDown}
          className={cn(controlBoxClasses, "flex h-11 items-center gap-2.5 text-start")}
        >
          {chosen ? (
            <>
              <Flag code={chosen.code} />
              <span className="min-w-0 flex-1 truncate">{chosen.name}</span>
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate text-ink-subtle">{placeholder}</span>
          )}
          <ChevronDown
            aria-hidden="true"
            className={cn("size-4 shrink-0 text-ink-subtle transition-transform", open && "rotate-180")}
          />
        </button>
        {/* The form's value, the options in the server HTML and the browser's autofill. Not a control a person meets. */}
        <select
          name={name}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
        >
          {placeholder !== undefined || value === "" ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {known || !value ? null : <option value={value}>{value}</option>}
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
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
              rows={countries}
              selected={value}
              initialQuery={seed}
              onSelect={choose}
              onTab={hide}
            />
          ) : null}
        </div>
      </div>
    );
  };

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
