// What a ticket page knows about its live connection (feature 28), as a tiny external store so React reads it with
// `useSyncExternalStore` and nothing has to set state from an effect.
// - `idle`: the stream has not been open on this page yet (loading, or a backend without the stream): say nothing.
// - `live`: events can arrive (this tab's stream is open, or another tab's was heard recently).
// - `lost`: it was live and is not now: the page says it is reconnecting and reads the ticket again every 30 s meanwhile.
// Safe to import anywhere.

export type Connection = "idle" | "live" | "lost";

export type ConnectionStore = {
  subscribe(listener: () => void): () => void;
  get(): Connection;
  /** Tells the store whether the stream is live now; listeners are called only when the answer changes. */
  update(live: boolean): void;
};

export function createConnectionStore(): ConnectionStore {
  let value: Connection = "idle";
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: () => value,
    update(live) {
      const next: Connection = live ? "live" : value === "idle" ? "idle" : "lost";
      if (next === value) return;
      value = next;
      for (const listener of [...listeners]) listener();
    },
  };
}
