"use client";
// SearchEnhancer: turns the shop header's server search field into the search combobox, without shipping the combobox
// on first load (backend plan 29 §7 "No JS on first load"). The field is SSR HTML (components/ui/search-input.tsx with
// `enhance`): Enter submits it to `/en/services?q=` with or without JavaScript. The header renders the field twice
// (desktop bar and phone row), so ids come from here, one `useId()` per copy, never from the server.
// At hydration it finds its own field through its wrapper and sets `id`, `role="combobox"`, `aria-expanded`,
// `aria-controls`, `aria-autocomplete` and the option-id prefix on it. On the first pointerenter, touchstart, focusin or
// pointerdown on the form it starts the lazy chunk (`./search-combobox`, the site's first dynamic import). The combobox
// never renders or replaces the field: it attaches to it, so text typed (and a phone keyboard opened) while the chunk
// loads stays. Keep this file tiny: it is on every English page.
import { lazy, Suspense, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { SearchComboboxLabels } from "./search-combobox";
import type { SearchPaths } from "@/lib/search/options";

const SearchCombobox = lazy(() => import("./search-combobox"));

/** What wakes the combobox: the visitor reaching for the form (hover, touch, focus, press). */
const WAKE_EVENTS = ["pointerenter", "touchstart", "focusin", "pointerdown"] as const;

export type SearchEnhancerProps = {
  /** The SearchInput with `enhance`. */
  children: ReactNode;
  labels: SearchComboboxLabels;
  paths: SearchPaths;
};

/** Wraps one copy of the header search form; the combobox loads on the first interaction with it. */
export function SearchEnhancer({ children, labels, paths }: SearchEnhancerProps) {
  const prefix = `search-${useId().replace(/[^\w-]/g, "")}`;
  const wrap = useRef<HTMLDivElement>(null);
  const [inputId, setInputId] = useState<string | null>(null);

  useEffect(() => {
    const input = wrap.current?.querySelector<HTMLInputElement>("[data-search-enhance] input");
    const form = input?.form;
    if (!input || !form) return;
    input.id = `${prefix}-input`;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", `${prefix}-listbox`);
    input.setAttribute("aria-autocomplete", "list");
    input.dataset.optionPrefix = `${prefix}-option`;
    const wake = () => setInputId(input.id);
    for (const type of WAKE_EVENTS) form.addEventListener(type, wake, { once: true, passive: true });
    // Focused before hydration (a tap on the phone row, a keyboard user): wake at once, after this effect.
    if (document.activeElement === input) queueMicrotask(wake);
    return () => {
      for (const type of WAKE_EVENTS) form.removeEventListener(type, wake);
    };
  }, [prefix]);

  return (
    <div ref={wrap}>
      {children}
      {inputId ? (
        <Suspense fallback={null}>
          <SearchCombobox inputId={inputId} prefix={prefix} labels={labels} paths={paths} />
        </Suspense>
      ) : null}
    </div>
  );
}
