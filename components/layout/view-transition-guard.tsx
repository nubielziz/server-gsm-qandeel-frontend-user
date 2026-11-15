"use client";
// ViewTransitionGuard: keeps a skipped view transition from surfacing as an uncaught error (owner report, 2026-11-15:
// the dev overlay showed "InvalidStateError: Transition was aborted because of invalid state. Document hidden" on the
// orders tabs).
// Why: a browser skips a view transition that starts while the tab is hidden (InvalidStateError) or that a newer one
// interrupts (AbortError), and rejects its `ready` promise. React chains `ready.then(...)` without a rejection handler,
// so the derived promise rejects unhandled: an uncaught error in the overlay, and Next treats an uncaught rejection during
// a client navigation as a navigation failure that may fall back to a full page load
// (next/dist/client/components/nav-failure-handler). A skipped transition is harmless (the page simply changes without
// the animation). The guard hands React a `ready` that resolves as usual but never settles when the browser skipped
// the transition, so React's animation step does not run and nothing rejects; every other member of the transition is
// the browser's own. The other two promises are marked handled.
import { useInsertionEffect } from "react";

type Transition = { ready?: Promise<unknown>; finished?: Promise<unknown>; updateCallbackDone?: Promise<unknown> };
const PATCHED = "__gsmViewTransitionGuard";

/** Wraps document.startViewTransition once per page; safe to call repeatedly. */
export function guardViewTransitions(doc: Document): void {
  const start = (doc as Document & { startViewTransition?: (arg?: unknown) => Transition }).startViewTransition;
  if (typeof start !== "function" || (doc as unknown as Record<string, unknown>)[PATCHED]) return;
  const original = start.bind(doc);
  Object.defineProperty(doc, PATCHED, { value: true });
  const guarded = (arg?: unknown) => {
    const transition = original(arg);
    if (!transition || typeof transition !== "object") return transition;
    transition.finished?.catch(() => {});
    transition.updateCallbackDone?.catch(() => {});
    const ready = transition.ready?.catch(() => new Promise<never>(() => {}));
    return new Proxy(transition, {
      get(target, key) {
        if (key === "ready") return ready;
        const value = Reflect.get(target, key, target) as unknown;
        return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
  };
  Object.assign(doc, { startViewTransition: guarded });
}

if (typeof document !== "undefined") guardViewTransitions(document);

/** Render once in the root layout: importing it installs the guard before the first client navigation. */
export function ViewTransitionGuard() {
  // The module-level call above already ran in the browser; this keeps the import from being tree-shaken.
  useInsertionEffect(() => guardViewTransitions(document), []);
  return null;
}
