// After a failed submit, move focus to the first invalid field, or to the form-level error when no field is marked.
// Call it from an effect that runs when the error state changes (the DOM then already carries `aria-invalid`).
// Safe to import anywhere (browser only at call time).

/** Focuses the first `[aria-invalid="true"]` control inside `root`, else the element marked `data-form-error`. */
export function focusFirstError(root: HTMLElement | null): void {
  if (!root) return;
  const target =
    root.querySelector<HTMLElement>('[aria-invalid="true"]') ?? root.querySelector<HTMLElement>("[data-form-error]");
  target?.focus();
}
