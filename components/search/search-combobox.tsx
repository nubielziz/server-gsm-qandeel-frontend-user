"use client";
// SearchCombobox: the header search of the English shop (backend plan 29 §7), loaded lazily by SearchEnhancer on the
// first interaction (its own chunk; keep it under 15 KB gzip). An ARIA 1.2 combobox with a listbox popup that ATTACHES
// to the server-rendered field: it never renders or replaces the field, so what was typed before it loaded stays, and
// Enter on plain text is still the field's own GET form (next/form → `/en/services?q=`).
// - Typing asks `GET /store/v1/search/suggest` (lib/search/suggest.ts: 150 ms debounce, every keystroke aborts the
//   request in flight, an LRU of 30 answers); the text found at wake-up is asked at once. Never Typesense directly.
// - The list (a `popover="manual"` panel under the form, `.popover-menu` timing) shows Suggestions (the ghost's phrase,
//   completions, "Did you mean"), Services (picture, highlighted title, brand logo, availability, price before tax in
//   the visitor's `gsm_currency`), Filters (ready chips), or on an empty box Recent and Popular searches; an IMEI offers
//   "Check IMEI". Options: lib/search/options.ts. Keyboard: lib/search/keyboard.ts (no option active until Down/Up).
// - The ghost (components/search/ghost-text.tsx) completes the text in grey; Tab or Right accepts it.
// - A polite live region says "6 suggestions, 4 services" 500 ms after the last answer.
// - The first service of an answer that stays for 300 ms is prefetched; nothing else is.
// Ids: the field's id, `aria-controls` and the option prefix come from the enhancer (one `useId()` per header copy).
import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { SuggestBody } from "@/lib/api/types";
import { CURRENCY_COOKIE } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { ghostFor, ghostShown, isCaretAtEnd } from "@/lib/search/ghost";
import { keyAction } from "@/lib/search/keyboard";
import { buildGroups, flatten, isPhrase, optionCounts, optionHref, type SearchOption, type SearchPaths } from "@/lib/search/options";
import { recentSearches } from "@/lib/search/recent";
import { createSuggestClient, fetchSuggest, suggestKey, type SuggestClient } from "@/lib/search/suggest";
import { GhostText, ghostMetrics, type GhostMetrics } from "./ghost-text";
import { SuggestionList, type SuggestionListLabels } from "./suggestion-list";

export type SearchComboboxLabels = SuggestionListLabels & {
  /** "{suggestions} suggestions, {services} services" (the live region). */
  status: string;
};

export type SearchComboboxProps = {
  /** The id the enhancer gave the field. */
  inputId: string;
  /** The enhancer's id prefix (listbox `<prefix>-listbox`, panel `<prefix>-panel`). */
  prefix: string;
  labels: SearchComboboxLabels;
  paths: SearchPaths;
};

/** The last answer and the raw text it answers. */
type Answer = { input: string; body: SuggestBody };

/** Gap between the form and the panel, and the panel's margin to the viewport edges, in px. */
const GAP = 6;
const EDGE = 8;
/** The panel's highest height on a fine pointer (a phone uses what the keyboard leaves). */
const MAX_HEIGHT = 512;
/** The live region speaks this long after the last answer, and the first service is prefetched after this. */
const STATUS_DELAY = 500;
const PREFETCH_DELAY = 300;

const COARSE = "(pointer: coarse)";
function subscribeCoarse(onChange: () => void): () => void {
  const query = window.matchMedia(COARSE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const coarseNow = () => window.matchMedia(COARSE).matches;
const coarseOnServer = () => false;

/** A cookie readable by scripts (`gsm_currency` is), or undefined. */
function readCookie(name: string): string | undefined {
  for (const part of document.cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      const value = part.slice(eq + 1).trim();
      return /^[A-Za-z]{3}$/.test(value) ? value.toUpperCase() : undefined;
    }
  }
  return undefined;
}

/** The field the enhancer prepared (looked up each time: it is not this component's element, and never state). */
function findField(id: string): HTMLInputElement | null {
  const element = document.getElementById(id);
  return element instanceof HTMLInputElement ? element : null;
}

/** What the first render needs from the field: where the ghost goes, the field's metrics, its text and focus. */
function readField(id: string) {
  const field = findField(id);
  return {
    wrapper: field?.closest<HTMLElement>("[data-search-enhance]") ?? null,
    metrics: field ? ghostMetrics(field) : ({} as GhostMetrics),
    value: field?.value ?? "",
    focused: field !== null && document.activeElement === field,
    optionPrefix: field?.dataset.optionPrefix ?? "",
  };
}

/** Closes the phone search row (a popover) that holds the form, if any: the page below is what the visitor wants now. */
function closeRow(form: HTMLFormElement | null | undefined): void {
  const row = form?.closest<HTMLElement>("[popover]");
  try {
    if (row?.matches(":popover-open")) row.hidePopover();
  } catch {
    /* already closed */
  }
}

export default function SearchCombobox({ inputId, prefix, labels, paths }: SearchComboboxProps) {
  const router = useRouter();
  const coarse = useSyncExternalStore(subscribeCoarse, coarseNow, coarseOnServer);
  // The combobox only ever renders in the browser (it is woken by an interaction), so the field can be read at once.
  const [initial] = useState(() => readField(inputId));
  const { wrapper, metrics } = initial;
  const [value, setValue] = useState(initial.value);
  const [focused, setFocused] = useState(initial.focused);
  const [recent, setRecent] = useState(() => recentSearches.list());
  const [answer, setAnswer] = useState<Answer | null>(null);
  /** The visitor wants the list (focus, typing, arrows); it shows only while focused and holding options. */
  const [open, setOpen] = useState(focused);
  const [active, setActive] = useState<number | null>(null);
  const [caretAtEnd, setCaretAtEnd] = useState(true);
  const [overflow, setOverflow] = useState(false);
  const [status, setStatus] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const client = useRef<SuggestClient | null>(null);
  const prefetched = useRef(new Set<string>());

  const listboxId = `${prefix}-listbox`;
  const optionPrefix = initial.optionPrefix || `${prefix}-option`;
  const optionId = (index: number) => `${optionPrefix}-${index}`;

  const ghost = ghostFor(answer ? { input: answer.input, ghost: answer.body.ghost } : null, value);
  const groups = useMemo(
    () => buildGroups({ value, answer: answer?.body ?? null, answerFor: answer?.input, ghost, recent, coarse }),
    [value, answer, ghost, recent, coarse],
  );
  const options = useMemo(() => flatten(groups), [groups]);
  const shown = open && focused && options.length > 0;
  const current = shown && active !== null && active < options.length ? active : null;
  const activeOption = current === null ? null : options[current];
  const drawGhost = ghostShown({ ghost, overflow, caretAtEnd, coarse, optionActive: activeOption !== null });

  // Plain functions (not effect events): the panel's own handlers call them, and so do the field's listeners below.

  /** The caret and overflow facts the ghost needs, read from the field. */
  const measure = () => {
    const field = findField(inputId);
    if (!field) return;
    setCaretAtEnd(isCaretAtEnd(field));
    setOverflow(field.scrollWidth > field.clientWidth + 1);
  };

  /** Puts text in the field as if typed (the caret at the end) and asks for its suggestions. */
  const setText = (text: string) => {
    const field = findField(inputId);
    if (!field) return;
    field.value = text;
    field.setSelectionRange(text.length, text.length);
    field.scrollLeft = field.scrollWidth;
    setValue(text);
    setActive(null);
    setOpen(true);
    measure();
    client.current?.type(text);
  };

  /** Leaves for an option's page: the list closes, a chosen phrase is kept as a recent search and shown in the box. */
  const leave = (option: SearchOption) => {
    const field = findField(inputId);
    client.current?.cancel();
    setOpen(false);
    setActive(null);
    if (isPhrase(option) && field) {
      setRecent(recentSearches.add(option.text));
      field.value = option.text;
      setValue(option.text);
    }
    closeRow(field?.form);
  };

  /** Enter on an active option, or a click: follow its link, or act ("Clear recent searches"). */
  const choose = (index: number, navigate: boolean) => {
    const option = options[index];
    if (!option) return;
    if (option.kind === "clearRecent") {
      recentSearches.clear();
      setRecent([]);
      setActive(null);
      findField(inputId)?.focus();
      return;
    }
    const href = optionHref(option, value, paths);
    leave(option);
    if (navigate && href) router.push(href);
  };

  const onAnswer = useEffectEvent((input: string, body: SuggestBody) => {
    setAnswer({ input, body });
    setActive(null);
  });

  const onInput = useEffectEvent(() => {
    const field = findField(inputId);
    if (!field) return;
    setValue(field.value);
    setActive(null);
    setOpen(true);
    measure();
    client.current?.type(field.value);
  });

  const onFocus = useEffectEvent(() => {
    const field = findField(inputId);
    if (!field) return;
    setFocused(true);
    setOpen(true);
    setRecent(recentSearches.list());
    measure();
    client.current?.resume();
    // Ask unless the answer on screen is already this text's (a focus after a blur on the same text).
    if (!answer || suggestKey(answer.input) !== suggestKey(field.value)) client.current?.now(field.value);
  });

  /** The field lost focus: close, unless the focus went into the panel (a tap on an option on a phone). */
  const close = (next: EventTarget | null) => {
    if (next instanceof Node && (panel.current?.contains(next) || next === findField(inputId))) return;
    setFocused(false);
    setOpen(false);
    setActive(null);
  };
  const onBlur = useEffectEvent((next: EventTarget | null) => close(next));
  /**
   * The listeners are attached: take the field's state as it is now. Keystrokes typed after the first render and before this
   * effect fired no `input` event here, so the text, the focus and the open state are read again; then the text (or a focused
   * empty box, for the popular searches) is asked at once.
   */
  const onWake = useEffectEvent(() => {
    const field = findField(inputId);
    if (!field) return;
    const hasFocus = document.activeElement === field;
    setValue(field.value);
    setFocused(hasFocus);
    if (hasFocus) setOpen(true);
    measure();
    if (field.value !== "" || hasFocus) client.current?.now(field.value);
  });
  const onCaret = useEffectEvent(() => measure());

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const field = findField(inputId);
    if (!field || event.isComposing) return;
    const decision = keyAction({
      key: event.key,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      open: shown,
      count: options.length,
      active: current,
      activeIsPhrase: activeOption !== null && isPhrase(activeOption),
      ghost: drawGhost,
      caretAtEnd: isCaretAtEnd(field),
      hasText: field.value !== "",
    });
    if (decision.prevent) event.preventDefault();
    const { action } = decision;
    switch (action.type) {
      case "move":
        setOpen(true);
        setActive(action.active);
        if (options.length === 0) client.current?.now(field.value);
        break;
      case "activate":
        choose(action.index, true);
        break;
      case "accept":
        setText(value + ghost);
        break;
      case "fill": {
        const option = options[action.index];
        // A filled phrase ends with a space: the next suggestions are for the next word.
        if (option && isPhrase(option)) setText(`${option.text} `);
        break;
      }
      case "close":
        setOpen(false);
        setActive(null);
        break;
      case "clear":
        setText("");
        setOpen(false);
        break;
      case "leave":
        setActive(null);
        break;
      case "none":
        break;
    }
  });

  /** The form is submitted with the typed text (Enter with no active option, or the search button). */
  const onSubmit = useEffectEvent(() => {
    const field = findField(inputId);
    if (!field) return;
    client.current?.cancel();
    setRecent(recentSearches.add(field.value));
    setOpen(false);
    setActive(null);
    closeRow(field.form);
  });

  /** Places the panel under the form; on a phone its height follows what the keyboard leaves (`visualViewport`). */
  const place = useEffectEvent(() => {
    const element = panel.current;
    const form = findField(inputId)?.form;
    if (!element || !form) return;
    const rect = form.getBoundingClientRect();
    const viewport = window.visualViewport;
    const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    const width = Math.min(rect.width, window.innerWidth - 2 * EDGE);
    const left = Math.min(Math.max(EDGE, rect.left), window.innerWidth - width - EDGE);
    const top = rect.bottom + GAP;
    const room = bottom - top - EDGE;
    element.style.width = `${width}px`;
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.maxHeight = `${Math.max(120, coarse ? room : Math.min(MAX_HEIGHT, room))}px`;
  });

  // Wire the field: one suggest client and the native listeners (the field is not this component's element).
  useEffect(() => {
    const field = findField(inputId);
    if (!field) return;
    const form = field.form;
    const suggest = createSuggestClient({
      fetcher: (q, signal) => fetchSuggest(q, readCookie(CURRENCY_COOKIE), signal),
      scope: () => readCookie(CURRENCY_COOKIE) ?? "",
      onAnswer: (input, body) => onAnswer(input, body),
    });
    client.current = suggest;
    const input = () => onInput();
    const focus = () => onFocus();
    const blur = (event: FocusEvent) => onBlur(event.relatedTarget);
    const keydown = (event: KeyboardEvent) => onKeyDown(event);
    const submit = () => onSubmit();
    const caret = () => onCaret();
    field.addEventListener("input", input);
    field.addEventListener("focus", focus);
    field.addEventListener("blur", blur);
    field.addEventListener("keydown", keydown);
    for (const type of ["keyup", "select", "pointerup"]) field.addEventListener(type, caret);
    form?.addEventListener("submit", submit);
    // Wake-up: the text typed while the chunk loaded is asked at once; a focused empty box asks for the popular searches. In the next
    // frame, so the field's state is read once the listeners are attached (and not as a cascading render of this effect).
    const wake = requestAnimationFrame(() => onWake());
    return () => {
      cancelAnimationFrame(wake);
      field.removeEventListener("input", input);
      field.removeEventListener("focus", focus);
      field.removeEventListener("blur", blur);
      field.removeEventListener("keydown", keydown);
      for (const type of ["keyup", "select", "pointerup"]) field.removeEventListener(type, caret);
      form?.removeEventListener("submit", submit);
      suggest.cancel();
      client.current = null;
    };
  }, [inputId]);

  // The field's ARIA state follows the list: expanded while shown, the active option as its active descendant.
  useEffect(() => {
    const field = findField(inputId);
    if (!field) return;
    field.setAttribute("aria-expanded", shown ? "true" : "false");
    if (current === null) field.removeAttribute("aria-activedescendant");
    else field.setAttribute("aria-activedescendant", `${optionPrefix}-${current}`);
    if (current !== null) document.getElementById(`${optionPrefix}-${current}`)?.scrollIntoView({ block: "nearest" });
  }, [inputId, shown, current, optionPrefix]);

  // Show or hide the panel (top layer, positioned from the form), and keep it under the form while it shows.
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    try {
      if (shown && !element.matches(":popover-open")) {
        place();
        element.showPopover();
      } else if (!shown && element.matches(":popover-open")) {
        element.hidePopover();
      }
    } catch {
      /* the panel left the document */
    }
    if (!shown) return;
    const follow = () => place();
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    window.visualViewport?.addEventListener("resize", follow);
    window.visualViewport?.addEventListener("scroll", follow);
    return () => {
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, { capture: true });
      window.visualViewport?.removeEventListener("resize", follow);
      window.visualViewport?.removeEventListener("scroll", follow);
    };
  }, [shown]);

  // The live region speaks 500 ms after the last answer (not on every keystroke).
  const announce = useEffectEvent(() => setStatus(focused ? fmt(labels.status, optionCounts(groups)) : ""));
  useEffect(() => {
    if (!answer) return;
    const timer = setTimeout(() => announce(), STATUS_DELAY);
    return () => clearTimeout(timer);
  }, [answer]);

  // The first service of an answer that stays for 300 ms is prefetched once; nothing else prefetches.
  useEffect(() => {
    const first = answer?.body.services[0];
    if (!first) return;
    const href = `${paths.results}/${encodeURIComponent(first.slug)}`;
    if (prefetched.current.has(href)) return;
    const timer = setTimeout(() => {
      prefetched.current.add(href);
      router.prefetch(href);
    }, PREFETCH_DELAY);
    return () => clearTimeout(timer);
  }, [answer, paths.results, router]);

  const onPick = (index: number, event: MouseEvent<HTMLElement>) => {
    const option = options[index];
    if (!option) return;
    // A link opened elsewhere (new tab or window) leaves this page as it is.
    if (option.kind !== "clearRecent" && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)) return;
    choose(index, false);
  };

  const onFill = (index: number) => {
    const option = options[index];
    if (!option || !isPhrase(option)) return;
    setText(`${option.text} `);
    findField(inputId)?.focus();
  };

  return (
    <>
      {wrapper ? createPortal(<GhostText value={value} ghost={drawGhost ? ghost : ""} metrics={metrics} />, wrapper) : null}
      <div
        ref={panel}
        id={`${prefix}-panel`}
        popover="manual"
        className="popover-menu"
        // A mouse press (or a tap's mouse event) on the panel must not take the focus from the field.
        onMouseDown={(event) => event.preventDefault()}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (!(next instanceof Node) || !panel.current?.contains(next)) close(next);
        }}
      >
        <SuggestionList
          id={listboxId}
          groups={groups}
          active={current}
          optionId={optionId}
          value={value}
          paths={paths}
          labels={labels}
          coarse={coarse}
          onPick={onPick}
          onFill={onFill}
        />
        {groups.some((group) => group.key === "services") ? (
          <p className="border-t border-line px-2.5 pb-1 pt-2 text-caption text-ink-subtle">{labels.taxNote}</p>
        ) : null}
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {status}
      </span>
    </>
  );
}
