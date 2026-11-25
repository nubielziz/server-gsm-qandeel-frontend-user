// SearchInput: a search form (GET) with a magnifier, one text field and a submit button.
// Uses next/form so a search is a soft navigation (with prefetching), and still works without JavaScript. It stays an
// honest server search field: no `id`, `role` or ARIA wiring of its own. With `enhance` its field wrapper carries
// `data-search-enhance`, where components/search/search-enhancer.tsx finds the field and turns it into the search
// combobox after hydration (English shop header only, backend plan 29 §7).
import Form from "next/form";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

export type SearchInputProps = {
  /** Where the form goes (GET), already prefixed, e.g. `sitePath("/services")`. */
  action: string;
  /** Accessible name of the field (also its visible label when `showLabel`). */
  label: string;
  /** Query parameter name (default `q`). */
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  /** Text of the submit button for screen readers (e.g. "Search"). */
  submitLabel: string;
  /** Extra values to send along (e.g. a filter that must survive the search). */
  hidden?: Record<string, string>;
  /** Makes the field 52px high. */
  large?: boolean;
  className?: string;
  /** Class of the text field itself. */
  inputClassName?: string;
  /** Marks the field for the search combobox (`data-search-enhance` on its wrapper); render it inside a SearchEnhancer. */
  enhance?: boolean;
  /**
   * The `autofocus` attribute: the field takes focus when a popover holding it opens (the phone search row), inside
   * the tap, so a phone opens its keyboard. Never on a field that is visible at page load.
   */
  autoFocus?: boolean;
};

/** A GET search form: `<SearchInput action={sitePath("/services")} label="Search services" submitLabel="Search" />`. */
export function SearchInput({
  action,
  label,
  name = "q",
  defaultValue,
  placeholder,
  submitLabel,
  hidden,
  large,
  className,
  inputClassName,
  enhance,
  autoFocus,
}: SearchInputProps) {
  return (
    <Form action={action} role="search" className={cn("flex w-full items-stretch", className)}>
      {hidden
        ? Object.entries(hidden).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)
        : null}
      <div className="relative min-w-0 flex-1" data-search-enhance={enhance ? "" : undefined}>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-[18px] text-ink-subtle"
        />
        <input
          type="search"
          name={name}
          aria-label={label}
          defaultValue={defaultValue}
          placeholder={placeholder}
          enterKeyHint="search"
          autoComplete="off"
          autoFocus={autoFocus}
          className={cn(
            "w-full rounded-s-control border border-control bg-surface ps-10 pe-3 text-base text-ink md:text-body",
            "placeholder:text-ink-subtle hover:border-ink-muted focus-visible:border-ink",
            "[&::-webkit-search-cancel-button]:appearance-none",
            large ? "h-13" : "h-11",
            inputClassName,
          )}
        />
      </div>
      <button
        type="submit"
        aria-label={submitLabel}
        title={submitLabel}
        className={cn(
          // btn-motion: the background eases and a press scales it (globals.css); no lift, it is joined to the field.
          "btn-motion inline-flex shrink-0 items-center justify-center rounded-e-control bg-primary text-on-primary hover:bg-primary-raised",
          large ? "w-13" : "w-11",
        )}
      >
        <Search aria-hidden="true" className="size-[18px]" />
      </button>
    </Form>
  );
}
