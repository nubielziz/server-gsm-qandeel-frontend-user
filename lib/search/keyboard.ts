// The keyboard model of the header combobox (ARIA 1.2 combobox with a listbox popup, backend plan 29 §7 "Keyboard"):
// focus never leaves the text box; the active option is only `aria-activedescendant`. No option is active until Down
// or Up; Down/Up move and wrap; Enter opens the active option, or submits the typed text when none is active; Escape
// closes the list, then clears the text; Tab or Right arrow at the end of the text accepts the ghost when no option is
// active, or fills the active phrase (Tab moves focus as usual when there is nothing to accept); Home, End and Left stay
// in the text and leave the list. Pure: the component turns the answer into DOM work.

/** What the key handler knows when a key goes down in the box. */
export type KeyContext = {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  /** The list is shown. */
  open: boolean;
  /** How many options the list holds. */
  count: number;
  /** The active option's index, or null. */
  active: number | null;
  /** The active option is a phrase the box can take (a completion, a recent or popular search, "Did you mean"). */
  activeIsPhrase: boolean;
  /** A ghost is drawn after the text (which implies the caret is at the end). */
  ghost: boolean;
  /** The caret is after the last character, nothing selected. */
  caretAtEnd: boolean;
  /** The box holds text. */
  hasText: boolean;
};

export type KeyAction =
  /** Let the browser do its usual thing (type, submit, move the caret or the focus). */
  | { type: "none" }
  /** Show the list with this option active (null: shown with none active). */
  | { type: "move"; active: number | null }
  /** Open the active option (follow its link, or act). */
  | { type: "activate"; index: number }
  /** Put the ghost's text into the box. */
  | { type: "accept" }
  /** Put the active phrase into the box. */
  | { type: "fill"; index: number }
  | { type: "close" }
  /** Empty the box (the list then shows the recent and popular searches). */
  | { type: "clear" }
  /** No option active any more; the browser still moves the caret. */
  | { type: "leave" };

/** The answer to one key, and whether the browser's own action must be stopped (`preventDefault`). */
export type KeyDecision = { action: KeyAction; prevent: boolean };

const NONE: KeyDecision = { action: { type: "none" }, prevent: false };

export function keyAction(ctx: KeyContext): KeyDecision {
  const { key, open, count, active } = ctx;
  // Shortcuts with a modifier belong to the browser (Alt+Down, Ctrl+Home, Cmd+Left …), and Shift+Tab goes back.
  if (ctx.altKey || ctx.ctrlKey || ctx.metaKey) return NONE;
  switch (key) {
    case "ArrowDown":
    case "ArrowUp": {
      if (count === 0) return { action: { type: "move", active: null }, prevent: true };
      const down = key === "ArrowDown";
      let next: number;
      if (!open || active === null) next = down ? 0 : count - 1;
      else next = down ? (active + 1) % count : (active - 1 + count) % count;
      return { action: { type: "move", active: next }, prevent: true };
    }
    case "Enter":
      return open && active !== null ? { action: { type: "activate", index: active }, prevent: true } : NONE;
    case "Escape":
      if (open) return { action: { type: "close" }, prevent: true };
      return ctx.hasText ? { action: { type: "clear" }, prevent: true } : NONE;
    case "Tab":
    case "ArrowRight": {
      if (key === "Tab" && ctx.shiftKey) return NONE;
      if (open && active !== null && ctx.activeIsPhrase) return { action: { type: "fill", index: active }, prevent: true };
      if (active === null && ctx.ghost && ctx.caretAtEnd) return { action: { type: "accept" }, prevent: true };
      return key === "ArrowRight" && active !== null ? { action: { type: "leave" }, prevent: false } : NONE;
    }
    case "ArrowLeft":
    case "Home":
    case "End":
      return active !== null ? { action: { type: "leave" }, prevent: false } : NONE;
    default:
      return NONE;
  }
}
