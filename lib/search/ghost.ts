// The ghost completion of the header combobox (backend plan 29 §7 "Ghost"): grey text drawn right after what the
// visitor typed, which Tab or Right arrow accepts. The API answers `ghost`, the remainder that completes its normalised
// text; the site draws it after the RAW value (its case and trailing spaces kept). Pure, safe to import anywhere.

/** An answer's ghost and the raw text it was asked for. */
export type GhostSource = { input: string; ghost: string | null };

/**
 * The ghost to draw after `value`, or "". The answer's own text gets its ghost; text typed since that agrees with the
 * ghost shortens it at once (answer for `icl` = `oud`; typing `o` shows `ud` before the next answer). Anything else
 * (a deleted letter, a different letter) draws nothing until a new answer comes.
 */
export function ghostFor(source: GhostSource | null, value: string): string {
  const ghost = source?.ghost ?? "";
  if (!source || !ghost || !value.trim()) return "";
  if (value === source.input) return ghost;
  if (!value.startsWith(source.input)) return "";
  const typed = value.slice(source.input.length);
  // The words typed since are matched without case, like the API's own completion; a space must be a space.
  if (!ghost.toLowerCase().startsWith(typed.toLowerCase())) return "";
  return ghost.slice(typed.length);
}

/** What decides whether the ghost may be drawn now. */
export type GhostContext = {
  ghost: string;
  /** The text is wider than the box (`scrollWidth > clientWidth`): the overlay could not line up. */
  overflow: boolean;
  /** The caret is at the end of the text and nothing is selected. */
  caretAtEnd: boolean;
  /** A coarse pointer (a phone): there is no Tab key to accept it. */
  coarse: boolean;
  /** An option is active (arrows): Tab and Right then act on the option. */
  optionActive: boolean;
};

/** Whether the ghost is drawn: there is one, it fits, the caret is at the end, there is a Tab key, no option is active. */
export function ghostShown({ ghost, overflow, caretAtEnd, coarse, optionActive }: GhostContext): boolean {
  return ghost !== "" && !overflow && caretAtEnd && !coarse && !optionActive;
}

/** Whether the caret sits after the last character with no selection (an input's `selectionStart`/`End`). */
export function isCaretAtEnd(field: { value: string; selectionStart: number | null; selectionEnd: number | null }): boolean {
  const end = field.value.length;
  return field.selectionStart === end && field.selectionEnd === end;
}
