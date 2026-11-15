// The toast of a live notification (feature 27, plan §5.1): which events may toast, what the toast says, and the batching
// that keeps a campaign from burying the page. Pure: the timers and the toast itself are passed in, so Vitest needs no browser.
// Plain text only (plan D11): the title and body are used as text nodes by the toast, never as HTML.

/** At most one toast in this window; the rest of the window becomes one "{count} new notifications". */
export const TOAST_WINDOW_MS = 3_000;
/** The longest body shown in a toast (characters, not UTF-16 units). */
export const TOAST_BODY_LENGTH = 120;

/**
 * The first 120 characters of a notification body on one line, with an ellipsis when it was cut. Line breaks and runs of
 * spaces collapse; a character outside the BMP (an emoji) is never split in two.
 */
export function toastDescription(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  const characters = Array.from(flat);
  return characters.length > TOAST_BODY_LENGTH ? `${characters.slice(0, TOAST_BODY_LENGTH).join("").trimEnd()}…` : flat;
}

/** True when the visitor is on the notifications page of the area (or below it): the list shows the item, so no toast. */
export function onNotificationsPage(pathname: string, notificationsPath: string): boolean {
  return pathname === notificationsPath || pathname.startsWith(`${notificationsPath}/`);
}

export type ToastBatcherOptions<T> = {
  timers: { setTimeout(callback: () => void, ms: number): unknown; clearTimeout(handle: unknown): void };
  /** Shows one item's own toast. */
  showOne(item: T): void;
  /** Shows the summary of two or more items that came in one window. */
  showMany(count: number): void;
  windowMs?: number;
};

export type ToastBatcher<T> = {
  /** An item that deserves a toast: shown at once when the window is closed, else held for the end of the window. */
  push(item: T): void;
  /** Forgets what is held and stops the timer (unmount). */
  dispose(): void;
};

/**
 * One toast every `windowMs`. The first item toasts at once and opens a window; what arrives in the window waits, and at
 * its end becomes one toast (the item itself when it is alone, else "{count} new notifications") that opens the next window.
 */
export function createToastBatcher<T>({ timers, showOne, showMany, windowMs = TOAST_WINDOW_MS }: ToastBatcherOptions<T>): ToastBatcher<T> {
  let timer: unknown = null;
  let held = 0;
  let last: T | undefined;

  function openWindow() {
    timer = timers.setTimeout(endWindow, windowMs);
  }

  function endWindow() {
    timer = null;
    if (held === 0) return;
    const count = held;
    const item = last as T;
    held = 0;
    last = undefined;
    if (count === 1) showOne(item);
    else showMany(count);
    openWindow();
  }

  return {
    push(item) {
      if (timer === null) {
        showOne(item);
        openWindow();
        return;
      }
      held += 1;
      last = item;
    },
    dispose() {
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
      held = 0;
      last = undefined;
    },
  };
}
