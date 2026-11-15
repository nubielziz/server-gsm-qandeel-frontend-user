import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createToastBatcher, onNotificationsPage, TOAST_BODY_LENGTH, TOAST_WINDOW_MS, toastDescription } from "./notification-toast";

function setup() {
  const showOne = vi.fn<(item: string) => void>();
  const showMany = vi.fn<(count: number) => void>();
  const batcher = createToastBatcher<string>({
    timers: { setTimeout: (callback, ms) => setTimeout(callback, ms), clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) },
    showOne,
    showMany,
  });
  return { batcher, showOne, showMany };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("toast batching", () => {
  it("shows the first item at once and nothing more when the window passes quietly", () => {
    const { batcher, showOne, showMany } = setup();
    batcher.push("a");
    expect(showOne).toHaveBeenCalledWith("a");
    vi.advanceTimersByTime(TOAST_WINDOW_MS * 3);
    expect(showOne).toHaveBeenCalledTimes(1);
    expect(showMany).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("an item alone in the window gets its own toast at the end of it", () => {
    const { batcher, showOne } = setup();
    batcher.push("a");
    vi.advanceTimersByTime(1_000);
    batcher.push("b");
    expect(showOne).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(TOAST_WINDOW_MS - 1_000);
    expect(showOne).toHaveBeenCalledTimes(2);
    expect(showOne).toHaveBeenLastCalledWith("b");
  });

  it("two or more items in the window become one summary, and the next window starts after it", () => {
    const { batcher, showOne, showMany } = setup();
    batcher.push("a");
    batcher.push("b");
    batcher.push("c");
    batcher.push("d");
    expect(showOne).toHaveBeenCalledTimes(1);
    expect(showMany).not.toHaveBeenCalled();
    vi.advanceTimersByTime(TOAST_WINDOW_MS);
    expect(showMany).toHaveBeenCalledWith(3);
    expect(showOne).toHaveBeenCalledTimes(1);

    // A toast just appeared: the next one waits for its own window.
    batcher.push("e");
    expect(showOne).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(TOAST_WINDOW_MS);
    expect(showOne).toHaveBeenLastCalledWith("e");
    expect(showOne).toHaveBeenCalledTimes(2);
  });

  it("never shows two toasts less than a window apart", () => {
    const { batcher, showOne, showMany } = setup();
    const times: number[] = [];
    showOne.mockImplementation(() => times.push(Date.now()));
    showMany.mockImplementation(() => times.push(Date.now()));
    for (let i = 0; i < 40; i++) {
      batcher.push(String(i));
      vi.advanceTimersByTime(700);
    }
    vi.advanceTimersByTime(TOAST_WINDOW_MS * 2);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(TOAST_WINDOW_MS);
    expect(times.length).toBeGreaterThan(5);
  });

  it("dispose drops what is held and stops the timer", () => {
    const { batcher, showOne, showMany } = setup();
    batcher.push("a");
    batcher.push("b");
    batcher.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(TOAST_WINDOW_MS * 2);
    expect(showOne).toHaveBeenCalledTimes(1);
    expect(showMany).not.toHaveBeenCalled();
    batcher.push("c");
    expect(showOne).toHaveBeenCalledWith("c");
  });
});

describe("toastDescription", () => {
  it("keeps a short body as one line", () => {
    expect(toastDescription("Line one\n\nLine   two ")).toBe("Line one Line two");
  });

  it("cuts a long body at 120 characters with an ellipsis", () => {
    const text = toastDescription("x".repeat(500));
    expect(Array.from(text)).toHaveLength(TOAST_BODY_LENGTH + 1);
    expect(text.endsWith("…")).toBe(true);
    expect(toastDescription("y".repeat(TOAST_BODY_LENGTH))).toBe("y".repeat(TOAST_BODY_LENGTH));
  });

  it("never splits a character outside the BMP, and plain text stays plain text", () => {
    const text = toastDescription("😀".repeat(121));
    expect(text).toBe(`${"😀".repeat(120)}…`);
    expect(toastDescription("<b>bold</b> &amp; <script>")).toBe("<b>bold</b> &amp; <script>");
  });
});

describe("onNotificationsPage", () => {
  it("matches the page and what is below it, not a longer name", () => {
    expect(onNotificationsPage("/en/account/notifications", "/en/account/notifications")).toBe(true);
    expect(onNotificationsPage("/en/account/notifications/x", "/en/account/notifications")).toBe(true);
    expect(onNotificationsPage("/en/account/notifications-old", "/en/account/notifications")).toBe(false);
    expect(onNotificationsPage("/en/account", "/en/account/notifications")).toBe(false);
  });
});
