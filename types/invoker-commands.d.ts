// Invoker commands (`<button command="show-modal" commandfor="dialog-id">`): the browser opens or closes the dialog by
// itself, so a button works from the server HTML, before React hydrates (plan P4.1). React 19.3 passes both attributes
// through untouched (react-dom has no special handling for them); @types/react 19.3 does not declare them yet, so this file
// adds them to every <button>. Write them in lower case: React warns about unknown camelCase props on DOM elements.
// Spec: https://html.spec.whatwg.org/multipage/form-elements.html#attr-button-command
import "react";

declare module "react" {
  // The type parameter must match React's declaration for the interfaces to merge.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ButtonHTMLAttributes<T> {
    /**
     * What the button does to the element named by `commandfor` when it is clicked. `show-modal` opens a `<dialog>` as a
     * modal (focus trap, inert page, Esc), `close` closes it, `request-close` closes it unless its `cancel` event is
     * cancelled. Custom commands start with `--`. Browsers without invoker commands ignore it, so keep an `onClick` fallback.
     */
    command?: "show-modal" | "close" | "request-close" | "show-popover" | "hide-popover" | "toggle-popover" | `--${string}` | undefined;
    /** The `id` of the element `command` acts on (a `<dialog>` here). */
    commandfor?: string | undefined;
  }
}
