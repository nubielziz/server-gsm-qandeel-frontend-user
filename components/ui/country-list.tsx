"use client";
// CountryList: the inside of a country panel: a search box and the list it filters, each row a flag, the country's name and, in
// a phone box, its calling code. Used by CountrySelect and PhoneInput, which own the panel (a popover) and mount this list when it
// opens, so the search starts empty each time and the list of some 250 rows is never in the server HTML.
// Keyboard: the search box keeps the focus; Up, Down, Home and End move the marked row, Enter chooses it, Tab closes the panel
// (`onTab`) and Esc is the popover's own. Enter never reaches the form around the panel. The marked row is what a screen reader
// hears (`aria-activedescendant`). A search typed in any script is kept as typed (`dir="auto"`); digits find a calling code.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { searchCountries } from "@/lib/phone/dial";
import { Flag } from "./flag";
import { useUiText } from "./ui-text";

export type CountryListRow = {
  code: string;
  name: string;
  /** Shown after the name, left to right (a calling code, `+962`). */
  detail?: string;
};

export type CountryListProps = {
  /** The id of the list box (the opener's `aria-controls`). */
  id: string;
  /** The id of the element that names the list (the control that opens it). */
  labelledBy: string;
  rows: readonly CountryListRow[];
  /** The code of the chosen country: its row carries the tick and is marked when the list opens. */
  selected?: string;
  /** What the search box starts with (a letter typed on the closed control). */
  initialQuery?: string;
  onSelect: (code: string) => void;
  /** Tab was pressed in the search box: close the panel, the focus goes on by itself. */
  onTab?: () => void;
};

export function CountryList({ id, labelledBy, rows, selected, initialQuery = "", onSelect, onTab }: CountryListProps) {
  const ui = useUiText();
  const [query, setQuery] = useState(initialQuery);
  const shown = useMemo(() => searchCountries(rows, query), [rows, query]);
  // The marked row, by its place in the shown rows. It starts on the chosen country.
  const [marked, setMarked] = useState(() => Math.max(0, shown.findIndex((row) => row.code === selected)));
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const at = Math.min(marked, shown.length - 1);

  // The list mounts when its panel opens: the search box takes the focus then.
  useEffect(() => {
    search.current?.focus();
  }, []);

  // The marked row stays in sight (the first time, the chosen country is scrolled to).
  useEffect(() => {
    list.current?.querySelector('[data-marked="true"]')?.scrollIntoView({ block: "nearest" });
  }, [at, shown]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // An input method's Enter confirms its text; it does not choose a row.
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (shown.length > 0) setMarked((at + 1) % shown.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (shown.length > 0) setMarked((at - 1 + shown.length) % shown.length);
        break;
      case "Home":
        if (query !== "") break; // with text in the box, Home moves the caret
        event.preventDefault();
        setMarked(0);
        break;
      case "End":
        if (query !== "") break;
        event.preventDefault();
        setMarked(shown.length - 1);
        break;
      case "Enter":
        // Never the form's submit, with or without a row to choose.
        event.preventDefault();
        if (shown[at]) onSelect(shown[at].code);
        break;
      case "Tab":
        onTab?.();
        break;
    }
  }

  const rowId = (code: string) => `${id}-${code}`;

  return (
    <div className="flex max-h-[inherit] flex-col">
      <div className="relative shrink-0 border-b border-line p-1.5">
        <Search aria-hidden="true" className="pointer-events-none absolute start-4.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
        <input
          ref={search}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={shown[at] ? rowId(shown[at].code) : undefined}
          aria-label={ui.searchCountries}
          placeholder={ui.searchCountries}
          dir="auto"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="done"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setMarked(0);
          }}
          onKeyDown={onKeyDown}
          className="h-11 w-full rounded-control bg-transparent ps-10 pe-3 text-base text-ink placeholder:text-ink-subtle md:text-body"
        />
      </div>
      <ul ref={list} id={id} role="listbox" aria-labelledby={labelledBy} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        {shown.map((row, index) => (
          <li
            key={row.code}
            id={rowId(row.code)}
            role="option"
            aria-selected={row.code === selected}
            data-marked={index === at}
            onPointerMove={() => {
              if (index !== at) setMarked(index);
            }}
            onClick={() => onSelect(row.code)}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-3 text-body text-ink data-[marked=true]:bg-surface-muted"
          >
            <Flag code={row.code} />
            <span className="min-w-0 flex-1 truncate">{row.name}</span>
            {row.detail ? (
              <span dir="ltr" className="shrink-0 text-small text-ink-subtle tabular-nums">
                {row.detail}
              </span>
            ) : null}
            <Check aria-hidden="true" className={cn("size-4 shrink-0", row.code === selected ? "opacity-100" : "opacity-0")} />
          </li>
        ))}
      </ul>
      <p role="status" className={cn("px-3 pb-6 pt-4 text-center text-small text-ink-muted", shown.length > 0 && "sr-only")}>
        {shown.length === 0 ? ui.noCountryFound : null}
      </p>
    </div>
  );
}
