import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { createUnreadTickets, NAVIGATION_FLOOR_MS, unreadNumbers, type TicketWatch, type UnreadTicketsEnv } from "./unread-tickets";

/** A fake browser: a clock, a list source the tests script and the ticket events they send. */
function fakeEnv(answer: () => Promise<string[]> = async () => []) {
  let now = 1_000_000;
  const watchers: TicketWatch[] = [];
  const fetchUnread = vi.fn<UnreadTicketsEnv["fetchUnread"]>(answer);
  const stopWatch = vi.fn();
  const env: UnreadTicketsEnv = {
    fetchUnread,
    watch(_surface, handlers) {
      watchers.push(handlers);
      return () => {
        stopWatch();
        watchers.splice(watchers.indexOf(handlers), 1);
      };
    },
    now: () => now,
  };
  return {
    env,
    fetchUnread,
    stopWatch,
    watchers,
    advance(ms: number) {
      now += ms;
    },
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("unreadNumbers", () => {
  it("keeps the numbers of the tickets with an unseen reply", () => {
    expect(
      unreadNumbers([
        { number: "T-1", hasUnread: true },
        { number: "T-2", hasUnread: false },
        { number: "T-3", hasUnread: true },
      ]),
    ).toEqual(["T-1", "T-3"]);
  });
});

describe("the support badge's store", () => {
  it("knows nothing before the server's list, then takes it as is (no request)", () => {
    const fake = fakeEnv();
    const store = createUnreadTickets(fake.env);
    expect(store.getSnapshot("merchant")).toBeNull();
    store.reconcile("merchant", ["T-7"]);
    expect(store.getSnapshot("merchant")).toBe(true);
    store.reconcile("customer", []);
    expect(store.getSnapshot("customer")).toBe(false);
    expect(fake.fetchUnread).not.toHaveBeenCalled();
  });

  it("watches the ticket events only while a badge listens, and never opens anything itself", () => {
    const fake = fakeEnv();
    const store = createUnreadTickets(fake.env);
    const offA = store.subscribe("merchant", () => {});
    const offB = store.subscribe("merchant", () => {});
    expect(fake.watchers).toHaveLength(1);
    offA();
    expect(fake.stopWatch).not.toHaveBeenCalled();
    offB();
    expect(fake.stopWatch).toHaveBeenCalledTimes(1);
    expect(fake.watchers).toHaveLength(0);
  });

  it("follows the live events: a ticket's hasUnread, the visitor's own read, and tells its listeners only on a change", () => {
    const fake = fakeEnv();
    const store = createUnreadTickets(fake.env);
    const listener = vi.fn();
    store.subscribe("customer", listener);
    store.reconcile("customer", []);
    listener.mockClear();
    const [events] = fake.watchers;

    events.updated("T-5", true);
    expect(store.getSnapshot("customer")).toBe(true);
    events.updated("T-6", true);
    expect(listener).toHaveBeenCalledTimes(1); // still "a dot": no second render
    events.readByVisitor("T-5");
    expect(store.getSnapshot("customer")).toBe(true); // T-6 is still unseen
    events.updated("T-6", false);
    expect(store.getSnapshot("customer")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("ignores events before it knows the list: the first read decides", () => {
    const fake = fakeEnv();
    const store = createUnreadTickets(fake.env);
    store.subscribe("merchant", () => {});
    fake.watchers[0].updated("T-1", true);
    expect(store.getSnapshot("merchant")).toBeNull();
  });

  it("a navigation reads the list again, at most once per floor; a refetch event reads at once", async () => {
    const fake = fakeEnv(async () => ["T-9"]);
    const store = createUnreadTickets(fake.env);
    store.subscribe("merchant", () => {});
    store.reconcile("merchant", []);

    await store.refresh("merchant"); // just seeded: inside the floor
    expect(fake.fetchUnread).not.toHaveBeenCalled();
    fake.advance(NAVIGATION_FLOOR_MS);
    await store.refresh("merchant");
    expect(fake.fetchUnread).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot("merchant")).toBe(true);

    await store.refresh("merchant"); // inside the floor again
    expect(fake.fetchUnread).toHaveBeenCalledTimes(1);
    fake.watchers[0].refetch();
    await flush();
    expect(fake.fetchUnread).toHaveBeenCalledTimes(2);
  });

  it("a later server list never overwrites a newer value: when it differs the store asks the API", async () => {
    const fake = fakeEnv(async () => []);
    const store = createUnreadTickets(fake.env);
    store.subscribe("customer", () => {});
    store.reconcile("customer", ["T-1"]);
    fake.watchers[0].readByVisitor("T-1"); // read live, then an older render streams in
    store.reconcile("customer", ["T-1"]);
    expect(store.getSnapshot("customer")).toBe(false);
    await flush();
    expect(fake.fetchUnread).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot("customer")).toBe(false);
    store.reconcile("customer", []); // the same: nothing to ask
    expect(fake.fetchUnread).toHaveBeenCalledTimes(1);
  });

  it("never runs two reads at once; a forced read during one runs once after it", async () => {
    let release: (value: string[]) => void = () => {};
    const fake = fakeEnv(() => new Promise<string[]>((resolve) => (release = resolve)));
    const store = createUnreadTickets(fake.env);
    store.subscribe("merchant", () => {});
    const first = store.refresh("merchant");
    void store.refresh("merchant");
    fake.watchers[0].refetch();
    expect(fake.fetchUnread).toHaveBeenCalledTimes(1);
    release(["T-2"]);
    await flush();
    expect(fake.fetchUnread).toHaveBeenCalledTimes(2);
    release([]);
    await first;
    await flush();
    expect(store.getSnapshot("merchant")).toBe(false);
  });

  it("keeps the last value on a failure, and stops for good on 401/403 until a server list comes again", async () => {
    let fail: ApiError | Error = new Error("network");
    const fake = fakeEnv(async () => {
      throw fail;
    });
    const store = createUnreadTickets(fake.env);
    store.subscribe("merchant", () => {});
    store.reconcile("merchant", ["T-3"]);
    fake.advance(NAVIGATION_FLOOR_MS);
    await store.refresh("merchant");
    expect(store.getSnapshot("merchant")).toBe(true);

    fail = new ApiError({ status: 401, code: "UNAUTHORIZED" });
    fake.advance(NAVIGATION_FLOOR_MS);
    await store.refresh("merchant");
    fake.advance(NAVIGATION_FLOOR_MS);
    await store.refresh("merchant");
    expect(fake.fetchUnread).toHaveBeenCalledTimes(2);

    store.reconcile("merchant", []); // a new server render: the session works again
    expect(store.getSnapshot("merchant")).toBe(false);
    fake.advance(NAVIGATION_FLOOR_MS);
    fail = new Error("network");
    await store.refresh("merchant");
    expect(fake.fetchUnread).toHaveBeenCalledTimes(3);
  });
});
