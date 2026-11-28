"use client";
// useMounted: false while the server renders the page and while the browser hydrates it, true from the moment the component runs
// in the browser. It exists for one reason: a form that is server-rendered can be submitted BEFORE its script has loaded, and a
// <form> with no action and no method then sends a GET to its own address with every named field in the query string, so a
// password or a person's details would land in the address bar, the history, the server's and the proxies' logs and the Referer
// of the next page. Every form that holds a password or personal data therefore (1) says `method="post"` (a submit that is not
// caught by the script then carries the fields in a body, never in the address) and (2) keeps its submit button disabled until
// `useMounted()` is true (a disabled default button also blocks the Enter key, so the form cannot be submitted before the script
// runs). `useSyncExternalStore` with a server snapshot of false is the supported way to tell the two apart without an effect:
// the first client render matches the server HTML, and the real value follows at once. Browser and server safe.
import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

/** True once the component runs in the browser (after hydration); false on the server and during hydration. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}
