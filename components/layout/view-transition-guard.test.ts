import { describe, expect, it, vi } from "vitest";
import { guardViewTransitions } from "./view-transition-guard";

function fakeDocument() {
  const calls: unknown[] = [];
  const doc = {
    startViewTransition(arg: unknown) {
      calls.push(arg);
      const ready = Promise.reject(new Error("Transition was skipped"));
      return { ready, finished: Promise.resolve(), updateCallbackDone: Promise.resolve() };
    },
  } as unknown as Document;
  return { doc, calls };
}

describe("guardViewTransitions", () => {
  it("passes the call through, and a skipped transition leaves nothing unhandled", async () => {
    const { doc, calls } = fakeDocument();
    guardViewTransitions(doc);
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const transition = (doc as unknown as { startViewTransition: (a: unknown) => { ready: Promise<unknown> } }).startViewTransition({
      types: ["x"],
    });
    void transition.ready.then(() => {}); // what React does: a derived promise without a rejection handler
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off("unhandledRejection", unhandled);
    expect(calls).toEqual([{ types: ["x"] }]);
    expect(unhandled).not.toHaveBeenCalled();
    // A skipped transition's ready never settles, so a chained `ready.then(...)` neither runs nor rejects.
    const chained = vi.fn();
    void transition.ready.then(chained);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chained).not.toHaveBeenCalled();
  });

  it("wraps only once and ignores a document without view transitions", () => {
    const { doc } = fakeDocument();
    guardViewTransitions(doc);
    const first = (doc as unknown as { startViewTransition: unknown }).startViewTransition;
    // a resolved ready passes through
    guardViewTransitions(doc);
    expect((doc as unknown as { startViewTransition: unknown }).startViewTransition).toBe(first);
    expect(() => guardViewTransitions({} as Document)).not.toThrow();
  });
});
