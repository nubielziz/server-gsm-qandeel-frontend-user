// The "(n) " prefix of the tab title (owner, 2026-11-15): while the tab is hidden and something is unread, the tab strip
// shows the bell's number ("(3) Orders", "99+" at the cap, kept as one left-to-right unit in an Arabic title).
// - It is there only while the tab is hidden and the count is above 0. It goes when the count reaches 0 or the tab is
//   shown again (the bell then rings once when something arrived meanwhile, lib/notifications/bell-motion.ts).
// - Next rewrites the title on a client navigation (from the metadata, which may also stream in late): while a prefix is
//   due, the document is watched for a new or rewritten <title> and the prefix is put back. Every write strips the
//   prefix first, so it is never doubled; a title this module never prefixed is never touched.
// - Each mounted bell registers its count (a route Next keeps hidden unregisters with its effects); the highest wins.
// Pure: the title, the visibility and the watcher arrive through `TitleBadgeEnv`. `titleBadge` is the browser's instance:
// import it only from Client Components.

/** One or more prefixes this module writes: "(3) ", "(99+) ", "(⁦99+⁩) ". */
const PREFIX = /^(?:\(⁦?\d+\+?⁩?\) )+/;

/** `title` without the module's prefix. */
export function stripTitleBadge(title: string): string {
  return title.replace(PREFIX, "");
}

/** `title` with exactly one prefix for `text`, or none when `text` is null. */
export function titleWithBadge(title: string, text: string | null): string {
  const bare = stripTitleBadge(title);
  return text === null ? bare : `(${text}) ${bare}`;
}

export type TitleBadgeEnv = {
  getTitle(): string;
  setTitle(title: string): void;
  /** True while the tab is in the foreground. */
  isVisible(): boolean;
  /** Calls `listener` whenever the tab's visibility changes; returns the function that stops it. */
  onVisibilityChange(listener: () => void): () => void;
  /** Calls `listener` after the title may have changed (a <title> added, removed or rewritten); returns the stop function. */
  watchTitle(listener: () => void): () => void;
};

export type TitleBadge = {
  /** Registers or updates one bell: its unread count and the text the title shows for it. */
  set(owner: object, count: number, text: string): void;
  /** Unregisters a bell (unmount). The prefix goes with the last one. */
  remove(owner: object): void;
};

export function createTitleBadge(env: TitleBadgeEnv): TitleBadge {
  const owners = new Map<object, { count: number; text: string }>();
  /** The title carries a prefix of ours. */
  let applied = false;
  let stopWatch: (() => void) | undefined;
  let stopVisibility: (() => void) | undefined;

  /** The text the title should show now, or null for none. */
  function wanted(): string | null {
    if (env.isVisible()) return null;
    let top: { count: number; text: string } | null = null;
    for (const entry of owners.values()) if (top === null || entry.count > top.count) top = entry;
    return top !== null && top.count > 0 ? top.text : null;
  }

  function sync() {
    const text = wanted();
    if (text === null && !applied) return;
    const current = env.getTitle();
    const next = titleWithBadge(current, text);
    if (next !== current) env.setTitle(next);
    applied = text !== null;
    if (applied) {
      // Our own write wakes the watcher too: it then finds the title right and writes nothing.
      stopWatch ??= env.watchTitle(sync);
    } else {
      stopWatch?.();
      stopWatch = undefined;
    }
  }

  return {
    set(owner, count, text) {
      owners.set(owner, { count, text });
      stopVisibility ??= env.onVisibilityChange(sync);
      sync();
    },
    remove(owner) {
      if (!owners.delete(owner)) return;
      sync();
      if (owners.size > 0) return;
      stopVisibility?.();
      stopVisibility = undefined;
    },
  };
}

const browserEnv: TitleBadgeEnv = {
  getTitle: () => document.title,
  setTitle(title) {
    document.title = title;
  },
  isVisible: () => document.visibilityState === "visible",
  onVisibilityChange(listener) {
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
  watchTitle(listener) {
    // The metadata's <title> may be in the head or streamed into the body, so the whole document is watched. Only while a
    // prefix is due, which means a hidden tab: a visible one is never watched.
    const observer = new MutationObserver(listener);
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  },
};

/** The tab title's unread prefix, shared by every bell of the page. */
export const titleBadge = createTitleBadge(browserEnv);
