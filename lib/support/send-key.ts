// Which key press in the ticket reply box sends the message. Pure, so the rule is tested without a browser.
// Group C (decision 039): visitors may type in a script that needs an input method (Arabic, Chinese, Japanese ...). The
// Enter that confirms the method's candidate text is not a send, or the half-composed word would go out.

/** What the rule reads from a key press (`event.key`, `event.shiftKey`, `event.nativeEvent.isComposing`). */
export type SendKeyPress = { key: string; shiftKey: boolean; isComposing: boolean };

/** Enter sends; Shift+Enter is a new line; an Enter that confirms an input method's text sends nothing. */
export function sendsMessage(press: SendKeyPress): boolean {
  return press.key === "Enter" && !press.shiftKey && !press.isComposing;
}
