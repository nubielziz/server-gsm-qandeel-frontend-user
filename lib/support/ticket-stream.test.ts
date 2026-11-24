import { beforeEach, describe, expect, it, vi } from "vitest";

const created: { options: Record<string, unknown>; stop: ReturnType<typeof vi.fn> }[] = [];

// `createStream` builds the real browser environment: replace it by a client that only counts what the ticket code asks of it.
vi.mock("@/lib/realtime/browser", () => ({
  createStream: (options: Record<string, unknown>) => {
    const stop = vi.fn();
    created.push({ options, stop });
    return { subscribe: vi.fn(), onStatus: vi.fn(), status: () => ({ state: "idle", live: false }), start: vi.fn(), stop };
  },
}));

type TicketStreamModule = typeof import("./ticket-stream");
let acquireFamilyTicketStream: TicketStreamModule["acquireFamilyTicketStream"];
let openTicketStream: TicketStreamModule["openTicketStream"];
let ticketFamilyLockName: TicketStreamModule["ticketFamilyLockName"];
let watchFamilyTicketStream: TicketStreamModule["watchFamilyTicketStream"];

// A fresh module per test: the shared clients of the families are module state.
beforeEach(async () => {
  created.length = 0;
  vi.resetModules();
  ({ acquireFamilyTicketStream, openTicketStream, ticketFamilyLockName, watchFamilyTicketStream } =
    await import("./ticket-stream"));
});

describe("openTicketStream: the token page's own stream", () => {
  it("opens the ticket's route under its own lock, with the ticket events and the message dedupe", () => {
    const handle = openTicketStream({ kind: "own", url: "/store/v1/tickets/tok/stream", lockName: "gsm-ticket-T-1042" });
    expect(created).toHaveLength(1);
    expect(created[0].options).toMatchObject({ url: "/store/v1/tickets/tok/stream", lockName: "gsm-ticket-T-1042" });
    expect(created[0].options.events).toEqual(["ticket.message.created", "ticket.updated", "ticket.read"]);
    expect(typeof created[0].options.parseEvent).toBe("function");
    expect(typeof created[0].options.dedupeKey).toBe("function");
    // No probe: the ticket token needs no session, so a refusal only backs off.
    expect(created[0].options.probePath).toBeUndefined();
    handle.release();
    expect(created[0].stop).toHaveBeenCalledTimes(1);
  });

  it("each page gets a stream of its own", () => {
    openTicketStream({ kind: "own", url: "/a", lockName: "gsm-ticket-T-1" });
    openTicketStream({ kind: "own", url: "/b", lockName: "gsm-ticket-T-2" });
    expect(created).toHaveLength(2);
  });
});

describe("a family's ticket stream: shared and counted", () => {
  it("names its lock apart from the bell's, so both can run in one browser", () => {
    expect(ticketFamilyLockName("client")).toBe("gsm-ticket-stream-client");
    expect(ticketFamilyLockName("client")).not.toBe("gsm-stream-client");
    expect(ticketFamilyLockName("store")).toBe("gsm-ticket-stream-store");
    expect(ticketFamilyLockName("store")).not.toBe("gsm-stream-store");
  });

  it("opens one client for every user of a family, on the family's own route with the sign-out probe", () => {
    const a = acquireFamilyTicketStream("client");
    const b = openTicketStream({ kind: "family", family: "client" });
    expect(created).toHaveLength(1);
    expect(a.client).toBe(b.client);
    expect(created[0].options).toMatchObject({
      url: "/client/stream",
      lockName: "gsm-ticket-stream-client",
      probePath: "/client/notifications/unread-count",
    });
    a.release();
    a.release(); // a second release of the same user counts once
    expect(created[0].stop).not.toHaveBeenCalled();
    b.release();
    expect(created[0].stop).toHaveBeenCalledTimes(1);
  });

  it("opens the shop family's stream for a retail account, on its own route and probe", () => {
    const handle = openTicketStream({ kind: "family", family: "store" });
    expect(created).toHaveLength(1);
    expect(created[0].options).toMatchObject({
      url: "/store/v1/me/stream",
      lockName: "gsm-ticket-stream-store",
      probePath: "/store/v1/me/notifications/unread-count",
    });
    handle.release();
  });

  it("keeps a client per family, stops each when its last user leaves, and starts the same client afresh for the next page", () => {
    const store = acquireFamilyTicketStream("store");
    const client = acquireFamilyTicketStream("client");
    expect(created.map((entry) => entry.options.url)).toEqual(["/store/v1/me/stream", "/client/stream"]);
    store.release();
    client.release();
    expect(created.map((entry) => entry.stop.mock.calls.length)).toEqual([1, 1]);
    // `stop()` forgets the cursor and `start()` begins afresh, so the next page reuses the client instead of making another.
    const again = acquireFamilyTicketStream("client");
    expect(created).toHaveLength(2);
    expect(again.client).toBe(client.client);
    again.release();
    expect(created[1].stop).toHaveBeenCalledTimes(2);
  });
});

describe("watchFamilyTicketStream: the workspace's support badge only listens", () => {
  it("shares the family's client, is no user of it, and never starts or stops it", () => {
    const watch = watchFamilyTicketStream("client");
    expect(created).toHaveLength(1);
    const client = created[0];
    const handler = () => {};
    watch.subscribe("ticket.updated", handler);
    const page = acquireFamilyTicketStream("client");
    expect(created).toHaveLength(1); // the ticket page gets the same client
    page.release();
    // The page was the only user: the watcher does not keep the stream open.
    expect(client.stop).toHaveBeenCalledTimes(1);
  });
});
