// The site's theme (lib/theme/theme.ts): the guard script that runs before the first paint, the choice the toggle makes, and
// what follows it. The tests run in Node, so the page, the storage and the system preference are small stand-ins.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readTheme,
  setTheme,
  subscribeTheme,
  THEME_ATTRIBUTE,
  THEME_GUARD,
  THEME_KEY,
  THEME_SWITCHING_CLASS,
  toggleTheme,
  type Theme,
} from "./theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

type BrowserOptions = {
  /** What the storage holds for the key (any text, to try bad values). */
  stored?: string;
  /** The system prefers dark. */
  systemDark?: boolean;
  /** Reading and writing the storage throws (blocked site data). */
  storageThrows?: boolean;
  /** `matchMedia` is missing (an old browser). */
  noMatchMedia?: boolean;
  /** The listener API of the media query list is the old `addListener` (Safari before 14). */
  oldMediaListeners?: boolean;
};

/** A page, its storage and its system preference: what the guard and the functions of lib/theme/theme.ts touch. */
function browser(options: BrowserOptions = {}) {
  const data = new Map<string, string>();
  if (options.stored !== undefined) data.set(THEME_KEY, options.stored);
  const classes = new Set<string>();
  const mediaListeners: Array<() => void> = [];
  const storageListeners: Array<(event: { key: string | null }) => void> = [];
  const pageListeners: Array<(event: { persisted: boolean }) => void> = [];
  const timers: Array<() => void> = [];
  const queries: string[] = [];
  const media = {
    matches: options.systemDark === true,
    ...(options.oldMediaListeners
      ? { addListener: (fn: () => void) => void mediaListeners.push(fn) }
      : { addEventListener: (type: string, fn: () => void) => void (type === "change" && mediaListeners.push(fn)) }),
  };
  const fail = () => {
    if (options.storageThrows) throw new Error("SecurityError");
  };
  const window = {
    localStorage: {
      getItem: (key: string) => (fail(), data.get(key) ?? null),
      setItem: (key: string, value: string) => (fail(), void data.set(key, value)),
      removeItem: (key: string) => (fail(), void data.delete(key)),
    },
    ...(options.noMatchMedia
      ? {}
      : {
          matchMedia: (query: string) => {
            queries.push(query);
            return media;
          },
        }),
    addEventListener: (type: string, fn: (event: never) => void) => {
      if (type === "storage") storageListeners.push(fn as (event: { key: string | null }) => void);
      if (type === "pageshow") pageListeners.push(fn as (event: { persisted: boolean }) => void);
    },
    setTimeout: (fn: () => void) => timers.push(fn),
  };
  const dataset: Record<string, string> = {};
  const document = {
    documentElement: {
      dataset,
      classList: { add: (name: string) => void classes.add(name), remove: (name: string) => void classes.delete(name) },
    },
  };
  return {
    window,
    document,
    dataset,
    classes,
    queries,
    data,
    /** The system preference changes (and tells the listeners). */
    setSystemDark(dark: boolean) {
      media.matches = dark;
      for (const fn of mediaListeners) fn();
    },
    /** Another tab changes the stored choice (`null` removes it, as `localStorage.clear()` reports a null key). */
    otherTab(value: string | null, key: string | null = THEME_KEY) {
      if (value === null) data.delete(THEME_KEY);
      else data.set(THEME_KEY, value);
      for (const fn of storageListeners) fn({ key });
    },
    /** The page is shown again: from the back/forward cache (`persisted`) or by a normal load. */
    shown(persisted: boolean) {
      for (const fn of pageListeners) fn({ persisted });
    },
    /** Runs what the guard asked the page to do later. */
    runTimers() {
      for (const fn of timers.splice(0)) fn();
    },
    mediaListeners,
    storageListeners,
  };
}
type Browser = ReturnType<typeof browser>;

function runGuard(page: Browser): void {
  new Function("window", "document", THEME_GUARD)(page.window, page.document);
}

/** Stands in for the global page of the browser, for the functions that read `window` and `document`. */
function install(page: Browser): void {
  vi.stubGlobal("window", page.window);
  vi.stubGlobal("document", page.document);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("THEME_GUARD: the script that runs before the first paint", () => {
  it("uses the stored light choice, whatever the system prefers", () => {
    const page = browser({ stored: "light", systemDark: true });
    runGuard(page);
    expect(page.dataset.theme).toBe("light");
  });

  it("uses the stored dark choice, whatever the system prefers", () => {
    const page = browser({ stored: "dark", systemDark: false });
    runGuard(page);
    expect(page.dataset.theme).toBe("dark");
  });

  it("follows the system when nothing is stored: dark, then light", () => {
    const dark = browser({ systemDark: true });
    runGuard(dark);
    expect(dark.dataset.theme).toBe("dark");
    expect(dark.queries).toEqual([DARK_QUERY]);

    const light = browser({ systemDark: false });
    runGuard(light);
    expect(light.dataset.theme).toBe("light");
  });

  it("ignores a stored value that is neither theme", () => {
    for (const stored of ["", "auto", "Dark", "blue"]) {
      const page = browser({ stored, systemDark: true });
      runGuard(page);
      expect(page.dataset.theme, stored).toBe("dark");
    }
  });

  it("is light when the storage throws and the system has no preference to tell", () => {
    const page = browser({ storageThrows: true });
    runGuard(page);
    expect(page.dataset.theme).toBe("light");
  });

  it("still follows the system when only the storage throws", () => {
    const page = browser({ storageThrows: true, systemDark: true });
    runGuard(page);
    expect(page.dataset.theme).toBe("dark");
  });

  it("is light without matchMedia, and uses a stored choice without it", () => {
    const none = browser({ noMatchMedia: true });
    runGuard(none);
    expect(none.dataset.theme).toBe("light");

    const chosen = browser({ noMatchMedia: true, stored: "dark" });
    runGuard(chosen);
    expect(chosen.dataset.theme).toBe("dark");
  });

  it("follows a change of the system while no choice is stored", () => {
    const page = browser({ systemDark: false });
    runGuard(page);
    expect(page.dataset.theme).toBe("light");
    page.setSystemDark(true);
    expect(page.dataset.theme).toBe("dark");
    page.setSystemDark(false);
    expect(page.dataset.theme).toBe("light");
  });

  it("ignores a change of the system once a choice is stored", () => {
    const page = browser({ stored: "light", systemDark: false });
    runGuard(page);
    page.setSystemDark(true);
    expect(page.dataset.theme).toBe("light");
  });

  it("follows the system again when the choice is removed, and the system then changes", () => {
    const page = browser({ stored: "light", systemDark: true });
    runGuard(page);
    expect(page.dataset.theme).toBe("light");
    page.otherTab(null);
    expect(page.dataset.theme).toBe("dark");
    page.setSystemDark(false);
    expect(page.dataset.theme).toBe("light");
  });

  it("listens to the old media query API where `addEventListener` is missing", () => {
    const page = browser({ oldMediaListeners: true, systemDark: false });
    runGuard(page);
    page.setSystemDark(true);
    expect(page.dataset.theme).toBe("dark");
  });

  it("applies a choice made in another tab, and the removal of one", () => {
    const page = browser({ systemDark: false });
    runGuard(page);
    expect(page.dataset.theme).toBe("light");
    page.otherTab("dark");
    expect(page.dataset.theme).toBe("dark");
    page.otherTab("light");
    expect(page.dataset.theme).toBe("light");
    page.otherTab(null);
    expect(page.dataset.theme).toBe("light");
  });

  it("re-reads on a storage event with no key (the other tab cleared the storage) and skips other keys", () => {
    const page = browser({ stored: "dark", systemDark: false });
    runGuard(page);
    expect(page.dataset.theme).toBe("dark");
    page.dataset.theme = "light"; // something else changed it: an event for an unrelated key must not touch it
    page.otherTab("dark", "gsm.search.recent");
    expect(page.dataset.theme).toBe("light");
    page.otherTab("dark", null);
    expect(page.dataset.theme).toBe("dark");
  });

  it("registers its two listeners once, and never throws without a page", () => {
    const page = browser({ systemDark: true });
    runGuard(page);
    expect(page.mediaListeners).toHaveLength(1);
    expect(page.storageListeners).toHaveLength(1);
    expect(() => new Function("window", "document", THEME_GUARD)({}, { documentElement: { dataset: {} } })).not.toThrow();
    expect(() => new Function("window", "document", THEME_GUARD)({}, {})).not.toThrow();
    expect(() => new Function("window", "document", THEME_GUARD)(undefined, undefined)).not.toThrow();
  });

  it("reads the key and the attribute the rest of the site uses", () => {
    expect(THEME_GUARD).toContain(JSON.stringify(THEME_KEY));
    expect(THEME_GUARD).toContain(DARK_QUERY);
    expect(THEME_ATTRIBUTE).toBe("data-theme");
    expect(THEME_KEY).toBe("gsm.theme");
  });
});

describe("readTheme", () => {
  it("is the theme of <html>, and light for anything else", () => {
    const page = browser();
    install(page);
    expect(readTheme()).toBe("light");
    page.dataset.theme = "dark";
    expect(readTheme()).toBe("dark");
    page.dataset.theme = "light";
    expect(readTheme()).toBe("light");
    page.dataset.theme = "blue";
    expect(readTheme()).toBe("light");
  });

  it("is light on the server, where there is no page", () => {
    expect(readTheme()).toBe("light");
  });
});

describe("setTheme: the choice and the system", () => {
  /** Runs the animation frames that were asked for, one round at a time. */
  function frames() {
    let queue: Array<() => void> = [];
    vi.stubGlobal("requestAnimationFrame", (fn: () => void) => void queue.push(fn));
    return {
      pending: () => queue.length,
      next() {
        const run = queue;
        queue = [];
        for (const fn of run) fn();
      },
    };
  }

  function start(options: BrowserOptions, theme: Theme) {
    const page = browser(options);
    page.dataset.theme = theme;
    install(page);
    return page;
  }

  it("stores a choice that differs from the system", () => {
    frames();
    const page = start({ systemDark: false }, "light");
    setTheme("dark");
    expect(page.data.get(THEME_KEY)).toBe("dark");
    expect(page.dataset.theme).toBe("dark");
  });

  it("removes the stored choice when the choice is the system's own preference", () => {
    frames();
    const page = start({ systemDark: true, stored: "light" }, "light");
    setTheme("dark");
    expect(page.data.has(THEME_KEY)).toBe(false);
    expect(page.dataset.theme).toBe("dark");

    const other = start({ systemDark: false, stored: "dark" }, "dark");
    setTheme("light");
    expect(other.data.has(THEME_KEY)).toBe(false);
    expect(other.dataset.theme).toBe("light");
  });

  it("stores light when the system is dark (the choice differs), and the guard then keeps it", () => {
    frames();
    const page = start({ systemDark: true }, "dark");
    setTheme("light");
    expect(page.data.get(THEME_KEY)).toBe("light");
    const next = browser({ systemDark: true, stored: page.data.get(THEME_KEY) });
    runGuard(next);
    expect(next.dataset.theme).toBe("light");
  });

  it("still switches the page when the storage throws", () => {
    frames();
    const page = start({ storageThrows: true, systemDark: false }, "light");
    expect(() => setTheme("dark")).not.toThrow();
    expect(page.dataset.theme).toBe("dark");
  });

  it("without matchMedia the system counts as light", () => {
    frames();
    const page = start({ noMatchMedia: true }, "light");
    setTheme("dark");
    expect(page.data.get(THEME_KEY)).toBe("dark");
    setTheme("light");
    expect(page.data.has(THEME_KEY)).toBe(false);
  });

  it("holds the transitions while it switches, and lifts the hold after two frames", () => {
    const loop = frames();
    const page = start({ systemDark: false }, "light");
    setTheme("dark");
    expect(page.classes.has(THEME_SWITCHING_CLASS)).toBe(true);
    expect(page.dataset.theme).toBe("dark");
    loop.next();
    expect(page.classes.has(THEME_SWITCHING_CLASS)).toBe(true);
    loop.next();
    expect(page.classes.has(THEME_SWITCHING_CLASS)).toBe(false);
    expect(loop.pending()).toBe(0);
  });

  it("a second switch within the two frames keeps the hold until its own frames are over", () => {
    const loop = frames();
    const page = start({ systemDark: false }, "light");
    setTheme("dark");
    loop.next();
    setTheme("light");
    loop.next(); // the first switch's second frame: not its turn to lift the hold
    expect(page.classes.has(THEME_SWITCHING_CLASS)).toBe(true);
    loop.next();
    loop.next();
    expect(page.classes.has(THEME_SWITCHING_CLASS)).toBe(false);
  });

  it("does not touch the page when the theme is already shown", () => {
    const loop = frames();
    const page = start({ systemDark: false }, "dark");
    setTheme("dark");
    expect(page.classes.has(THEME_SWITCHING_CLASS)).toBe(false);
    expect(loop.pending()).toBe(0);
    expect(page.data.get(THEME_KEY)).toBe("dark");
  });

  it("does nothing on the server", () => {
    expect(() => setTheme("dark")).not.toThrow();
  });

  it("toggleTheme switches to the other theme", () => {
    frames();
    const page = start({ systemDark: false }, "light");
    toggleTheme();
    expect(page.dataset.theme).toBe("dark");
    toggleTheme();
    expect(page.dataset.theme).toBe("light");
    expect(page.data.has(THEME_KEY)).toBe(false); // light is the system's: back to following it
  });
});

describe("subscribeTheme", () => {
  class FakeObserver {
    static last: FakeObserver | null = null;
    observed: unknown[] = [];
    disconnected = false;
    constructor(readonly callback: () => void) {
      FakeObserver.last = this;
    }
    observe(...args: unknown[]) {
      this.observed = args;
    }
    disconnect() {
      this.disconnected = true;
    }
  }

  it("watches only the theme attribute of <html>, calls back on a change, and disconnects", () => {
    const page = browser();
    install(page);
    vi.stubGlobal("MutationObserver", FakeObserver);
    const callback = vi.fn();
    const stop = subscribeTheme(callback);
    const observer = FakeObserver.last!;
    expect(observer.observed).toEqual([page.document.documentElement, { attributes: true, attributeFilter: ["data-theme"] }]);
    observer.callback();
    expect(callback).toHaveBeenCalledTimes(1);
    stop();
    expect(observer.disconnected).toBe(true);
  });

  it("is a harmless no-op where there is no page or no observer", () => {
    expect(subscribeTheme(() => undefined)()).toBeUndefined();
    install(browser());
    expect(subscribeTheme(() => undefined)()).toBeUndefined();
  });
});

describe("THEME_GUARD: after the first paint", () => {
  it("does not hold the transitions for the first paint", () => {
    const page = browser({ systemDark: true });
    runGuard(page);
    expect(page.dataset.theme).toBe("dark");
    expect(page.classes.has(THEME_SWITCHING_CLASS)).toBe(false);
  });

  it("holds the transitions while a later change is painted, then lets them go", () => {
    const page = browser({ systemDark: false });
    runGuard(page);
    page.setSystemDark(true);
    expect(page.dataset.theme).toBe("dark");
    expect(page.classes.has(THEME_SWITCHING_CLASS)).toBe(true);
    page.runTimers();
    expect(page.classes.has(THEME_SWITCHING_CLASS)).toBe(false);
  });

  it("applies the choice again when the page comes back from the back/forward cache", () => {
    const page = browser({ systemDark: false });
    runGuard(page);
    expect(page.dataset.theme).toBe("light");
    // Another page of the site stored a choice while this one sat in the cache: no storage event reaches a cached page.
    page.data.set(THEME_KEY, "dark");
    page.shown(false);
    expect(page.dataset.theme).toBe("light");
    page.shown(true);
    expect(page.dataset.theme).toBe("dark");
  });
});
