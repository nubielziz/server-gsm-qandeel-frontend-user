// The visitor's recent searches, shown in the header combobox when the box is empty: at most 8, newest first, kept in
// this browser only (localStorage `gsm.search.recent`, never sent anywhere). A text that may hold personal data (an IMEI,
// a phone number, an email address: `isRecordableTerm`) is never kept. Where storage is blocked (a private window,
// blocked site data) the list lasts until the page is closed. `recentSearches` touches nothing at import.
import { isRecordableTerm } from "./terms";

export const RECENT_KEY = "gsm.search.recent";
export const MAX_RECENT = 8;

type RecentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type RecentSearches = {
  /** The kept searches, newest first. */
  list(): string[];
  /** Puts `text` first (once, whatever its case) and returns the new list; text that must not be kept is ignored. */
  add(text: string): string[];
  /** Forgets every recent search. */
  clear(): void;
};

/** Text as it is kept: inner whitespace collapsed, trimmed, at most 100 characters. */
function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 100);
}

/** The stored list, or [] for anything that is not a list of texts (an old format, a hand-edited value). */
function parse(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string" && tidy(item) !== "").map(tidy).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function createRecentSearches(storage: () => RecentStorage | null): RecentSearches {
  /** This page's list while storage refuses it (undefined once storage holds the list). */
  let session: string[] | undefined;
  const read = (): string[] => {
    if (session) return session;
    try {
      return parse(storage()?.getItem(RECENT_KEY));
    } catch {
      return [];
    }
  };
  const write = (list: string[]) => {
    session = list;
    try {
      const store = storage();
      if (!store) return;
      if (list.length === 0) store.removeItem(RECENT_KEY);
      else store.setItem(RECENT_KEY, JSON.stringify(list));
      session = undefined;
    } catch {
      // blocked or full storage: the list still holds until the page is closed
    }
  };
  return {
    list: read,
    add(text) {
      const term = tidy(text);
      const before = read();
      if (!isRecordableTerm(term)) return before;
      const next = [term, ...before.filter((item) => item.toLowerCase() !== term.toLowerCase())].slice(0, MAX_RECENT);
      write(next);
      return next;
    },
    clear() {
      write([]);
    },
  };
}

/** `localStorage`, or null where it is missing or blocked (a private window, blocked site data, the server). */
function browserStorage(): RecentStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The browser's recent searches. */
export const recentSearches = createRecentSearches(browserStorage);
