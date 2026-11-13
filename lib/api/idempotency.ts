// `Idempotency-Key` helpers (plan D13). The API treats a repeated key with the same body as a replay (one payment, one
// order, one top-up) and the same key with another body as 409 IDEMPOTENCY_KEY_REUSED. So a form keeps ONE key for as
// long as it sends the same request, takes a new key as soon as the request changes, and forgets the key after a success
// and after 409 IDEMPOTENCY_KEY_REUSED (a retry with the same signature would get the same key and fail the same way).
// After any other failure (the API stores nothing for a refusal) and after IDEMPOTENCY_IN_PROGRESS, keep the key.
// Safe to import anywhere; the browser client re-exports `newIdempotencyKey` for older imports.

/** A fresh key: a UUID (1-100 printable ASCII characters, no spaces: what the API accepts). */
export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export type IdempotencyKeys = {
  /**
   * The key for a request. `signature` identifies the request: the JSON of the body, or a fixed text for a call with no
   * body. The same signature as the last call returns the same key (a retry or a double click); a different one
   * returns a new key (the previous signature is forgotten, so going back to it also gets a new key).
   */
  keyFor(signature: string): string;
  /**
   * Forgets the key: call it after a success and after 409 IDEMPOTENCY_KEY_REUSED, so the next request starts with a
   * new key. Keep the key after any other failure (the API stores nothing for a refusal) and after
   * IDEMPOTENCY_IN_PROGRESS (the same request is still running: a retry must replay it, not start another).
   */
  reset(): void;
};

/**
 * One key store per form or flow (keep it in a `useRef`, not in module scope). `make` is for tests.
 * `/pay` and the balance payment must NOT share a store: the balance key is never a key a `/pay` call used.
 */
export function createIdempotencyKeys(make: () => string = newIdempotencyKey): IdempotencyKeys {
  let current: { signature: string; key: string } | undefined;
  return {
    keyFor(signature) {
      if (current?.signature !== signature) current = { signature, key: make() };
      return current.key;
    },
    reset() {
      current = undefined;
    },
  };
}
