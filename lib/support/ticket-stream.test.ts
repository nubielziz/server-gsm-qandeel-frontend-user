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
let acquireSurfaceTicketStream: TicketStreamModule["acquireSurfaceTicketStream"];
let openTicketStream: TicketStreamModule["openTicketStream"];
let ticketSurfaceLockName: TicketStreamModule["ticketSurfaceLockName"];

// A fresh module per test: the shared clients of the surfaces are module state.
beforeEach(async () => {
  created.length = 0;
  vi.resetModules();
  ({ acquireSurfaceTicketStream, openTicketStream, ticketSurfaceLockName } = await import("./ticket-stream"));
});

describe("openTicketStream: the customer's own stream", () => {
  it("opens the ticket's route under its own lock, with the ticket events and the message dedupe", () => {
    const handle = openTicketStream({ kind: "own", url: "/store/v1/tickets/tok/stream", lockName: "gsm-ticket-T-1042" });
    expect(created).toHaveLength(1);
    expect(created[0].options).toMatchObject({ url: "/store/v1/tickets/tok/stream", lockName: "gsm-ticket-T-1042" });
    expect(created[0].options.events).toEqual(["ticket.message.created", "ticket.updated", "ticket.read", "ticket.typing"]);
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

describe("the merchant surface's ticket stream: shared and counted", () => {
  it("names its lock apart from the bell's, so both can run in one browser", () => {
    expect(ticketSurfaceLockName("merchant")).toBe("gsm-ticket-stream-merchant");
    expect(ticketSurfaceLockName("merchant")).not.toBe("gsm-stream-merchant");
  });

  it("opens one client for every user of a surface, on the surface's own route with the sign-out probe", () => {
    const a = acquireSurfaceTicketStream("merchant");
    const b = openTicketStream({ kind: "surface", surface: "merchant" });
    expect(created).toHaveLength(1);
    expect(a.client).toBe(b.client);
    expect(created[0].options).toMatchObject({
      url: "/client/stream",
      lockName: "gsm-ticket-stream-merchant",
      probePath: "/client/notifications/unread-count",
    });
    a.release();
    a.release(); // a second release of the same user counts once
    expect(created[0].stop).not.toHaveBeenCalled();
    b.release();
    expect(created[0].stop).toHaveBeenCalledTimes(1);
  });

  it("keeps a client per surface, stops each when its last user leaves, and starts the same client afresh for the next page", () => {
    const customer = acquireSurfaceTicketStream("customer");
    const merchant = acquireSurfaceTicketStream("merchant");
    expect(created.map((entry) => entry.options.url)).toEqual(["/store/v1/me/stream", "/client/stream"]);
    customer.release();
    merchant.release();
    expect(created.map((entry) => entry.stop.mock.calls.length)).toEqual([1, 1]);
    // `stop()` forgets the cursor and `start()` begins afresh, so the next page reuses the client instead of making another.
    const again = acquireSurfaceTicketStream("merchant");
    expect(created).toHaveLength(2);
    expect(again.client).toBe(merchant.client);
    again.release();
    expect(created[1].stop).toHaveBeenCalledTimes(2);
  });
});
