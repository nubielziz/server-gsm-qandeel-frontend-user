import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTitleBadge, stripTitleBadge, titleWithBadge, type TitleBadgeEnv } from "./title-badge";

/** A fake document: its title, a visibility switch, and a watcher the test fires like a MutationObserver would (a microtask later). */
function fakeDocument(options: { title?: string; visible?: boolean } = {}) {
  let title = options.title ?? "Orders";
  let visible = options.visible ?? true;
  const visibility = new Set<() => void>();
  const watchers = new Set<() => void>();
  const setTitle = vi.fn((next: string) => {
    title = next;
    for (const watcher of [...watchers]) queueMicrotask(watcher);
  });
  const env: TitleBadgeEnv = {
    getTitle: () => title,
    setTitle,
    isVisible: () => visible,
    onVisibilityChange(listener) {
      visibility.add(listener);
      return () => {
        visibility.delete(listener);
      };
    },
    watchTitle(listener) {
      watchers.add(listener);
      return () => {
        watchers.delete(listener);
      };
    },
  };
  return {
    env,
    setTitle,
    title: () => title,
    watchers: () => watchers.size,
    visibilityListeners: () => visibility.size,
    /** Next (or the page) writes a new title, as a client navigation does. */
    navigate(next: string) {
      title = next;
      for (const watcher of [...watchers]) queueMicrotask(watcher);
    },
    setVisible(next: boolean) {
      visible = next;
      for (const listener of [...visibility]) listener();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the prefix text", () => {
  it("adds one prefix and replaces an old one instead of doubling it", () => {
    expect(titleWithBadge("Orders", "3")).toBe("(3) Orders");
    expect(titleWithBadge("(3) Orders", "4")).toBe("(4) Orders");
    expect(titleWithBadge("(3) (3) Orders", "99+")).toBe("(99+) Orders");
    expect(titleWithBadge("(\u206699+\u2069) Orders", "5")).toBe("(5) Orders");
    expect(titleWithBadge("(4) Orders", null)).toBe("Orders");
  });

  it("leaves a title that only looks alike alone", () => {
    expect(stripTitleBadge("(Beta) Orders")).toBe("(Beta) Orders");
    expect(stripTitleBadge("Orders (3)")).toBe("Orders (3)");
  });
});

describe("the hidden tab's title", () => {
  it("never touches the title of a visible tab", () => {
    const doc = fakeDocument();
    const badge = createTitleBadge(doc.env);
    badge.set({}, 3, "3");
    expect(doc.setTitle).not.toHaveBeenCalled();
    expect(doc.watchers()).toBe(0);
  });

  it("adds the prefix when the tab is hidden, updates it with the count and removes it at 0", () => {
    const doc = fakeDocument();
    const badge = createTitleBadge(doc.env);
    const bell = {};
    badge.set(bell, 3, "3");
    doc.setVisible(false);
    expect(doc.title()).toBe("(3) Orders");
    badge.set(bell, 4, "4");
    expect(doc.title()).toBe("(4) Orders");
    badge.set(bell, 100, "99+");
    expect(doc.title()).toBe("(99+) Orders");
    badge.set(bell, 0, "0");
    expect(doc.title()).toBe("Orders");
    expect(doc.watchers()).toBe(0);
  });

  it("removes the prefix when the tab is shown again", () => {
    const doc = fakeDocument({ visible: false });
    const badge = createTitleBadge(doc.env);
    badge.set({}, 2, "2");
    expect(doc.title()).toBe("(2) Orders");
    doc.setVisible(true);
    expect(doc.title()).toBe("Orders");
    expect(doc.watchers()).toBe(0);
  });

  it("puts the prefix back when a navigation rewrites the title, once, and stops after its own write", async () => {
    const doc = fakeDocument({ visible: false });
    const badge = createTitleBadge(doc.env);
    badge.set({}, 2, "2");
    doc.setTitle.mockClear();
    doc.navigate("Wallet");
    await vi.runAllTimersAsync();
    expect(doc.title()).toBe("(2) Wallet");
    // One write: the watcher woken by it finds the title right.
    expect(doc.setTitle).toHaveBeenCalledTimes(1);
    doc.navigate("(2) Wallet");
    await vi.runAllTimersAsync();
    expect(doc.setTitle).toHaveBeenCalledTimes(1);
  });

  it("does nothing when nothing is unread", () => {
    const doc = fakeDocument({ visible: false });
    const badge = createTitleBadge(doc.env);
    badge.set({}, 0, "0");
    expect(doc.setTitle).not.toHaveBeenCalled();
  });

  it("shows the highest count of the bells on the page and goes with the last one", () => {
    const doc = fakeDocument({ visible: false });
    const badge = createTitleBadge(doc.env);
    const old = {};
    const fresh = {};
    badge.set(old, 2, "2");
    badge.set(fresh, 5, "5");
    expect(doc.title()).toBe("(5) Orders");
    badge.remove(fresh);
    expect(doc.title()).toBe("(2) Orders");
    badge.remove(old);
    expect(doc.title()).toBe("Orders");
    expect(doc.watchers()).toBe(0);
    expect(doc.visibilityListeners()).toBe(0);
  });
});
