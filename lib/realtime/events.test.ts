import { describe, expect, it } from "vitest";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { dedupeKeyOf, parseFrame, STREAM_API, STREAM_PROBE_API, streamLockName } from "./events";

const item = {
  id: 41,
  category: "order",
  title: "Order done",
  body: "Your order is ready",
  link: "/account/orders",
  readAt: null,
  createdAt: "2026-11-15T10:00:00.000Z",
  campaignId: null,
  event: "order.completed",
};

describe("stream names", () => {
  it("one route, one probe and one lock per family", () => {
    expect(STREAM_API).toEqual({ store: "/store/v1/me/stream", client: "/client/stream" });
    expect(STREAM_PROBE_API).toEqual({
      store: "/store/v1/me/notifications/unread-count",
      client: "/client/notifications/unread-count",
    });
    expect(streamLockName("store")).toBe("gsm-stream-store");
    expect(streamLockName("client")).toBe("gsm-stream-client");
  });

  it("the routes follow the route table of the families", () => {
    expect(STREAM_API.store).toBe(FAMILY_ROUTES.store.stream);
    expect(STREAM_API.client).toBe(FAMILY_ROUTES.client.stream);
    expect(STREAM_PROBE_API.store).toBe(`${FAMILY_ROUTES.store.notifications}/unread-count`);
    expect(STREAM_PROBE_API.client).toBe(`${FAMILY_ROUTES.client.notifications}/unread-count`);
  });

  it("a family never shares a lock or a route with the other", () => {
    expect(streamLockName("store")).not.toBe(streamLockName("client"));
    expect(STREAM_API.store).not.toBe(STREAM_API.client);
  });
});

describe("parseFrame", () => {
  it("accepts notification.created and keeps the item as sent", () => {
    const data = parseFrame("notification.created", JSON.stringify({ item, unread: 3, live: true }));
    expect(data).toEqual({ item, unread: 3, live: true });
    expect(parseFrame("notification.created", JSON.stringify({ item, unread: 3 }))).toMatchObject({ live: false });
  });

  it("accepts an item without a language, and one that still names one (an API from before English only)", () => {
    expect(item).not.toHaveProperty("locale");
    expect(parseFrame("notification.created", JSON.stringify({ item, unread: 1 }))).toEqual({ item, unread: 1, live: false });
    for (const locale of ["en", "fr", null]) {
      expect(parseFrame("notification.created", JSON.stringify({ item: { ...item, locale }, unread: 1 })), String(locale)).toMatchObject({
        item: { id: 41 },
        unread: 1,
      });
    }
  });

  it("drops a notification.created that is not an item with a count", () => {
    expect(parseFrame("notification.created", "{")).toBeUndefined();
    expect(parseFrame("notification.created", JSON.stringify({ unread: 3 }))).toBeUndefined();
    expect(parseFrame("notification.created", JSON.stringify({ item: { ...item, id: "41" }, unread: 3 }))).toBeUndefined();
    expect(parseFrame("notification.created", JSON.stringify({ item: { ...item, title: 5 }, unread: 3 }))).toBeUndefined();
    expect(parseFrame("notification.created", JSON.stringify({ item, unread: "3" }))).toBeUndefined();
  });

  it("parses notification.read and unread.changed", () => {
    expect(parseFrame("notification.read", JSON.stringify({ ids: [4, "x", 5], all: false, upToId: null, unread: 2 }))).toEqual({
      ids: [4, 5],
      all: false,
      upToId: null,
      unread: 2,
    });
    expect(parseFrame("notification.read", JSON.stringify({ ids: [], all: true, upToId: 9, unread: 0 }))).toEqual({
      ids: [],
      all: true,
      upToId: 9,
      unread: 0,
    });
    expect(parseFrame("notification.read", JSON.stringify({ all: true, unread: 0 }))).toBeUndefined();
    expect(parseFrame("unread.changed", '{"unread":7}')).toEqual({ unread: 7 });
    expect(parseFrame("unread.changed", '{"unread":null}')).toBeUndefined();
  });

  it("hands the base events to the shared parser and drops events it does not know", () => {
    expect(parseFrame("ready", '{"v":1,"heartbeatMs":15000,"resumed":false,"serverTime":1}')).toMatchObject({ resumed: false });
    expect(parseFrame("bye", '{"reason":"shutdown"}')).toEqual({ reason: "shutdown" });
    expect(parseFrame("hb", "17")).toBe(17);
    expect(parseFrame("message.created", "{}")).toBeUndefined();
  });
});

describe("dedupeKeyOf", () => {
  it("names an item by its id and nothing else", () => {
    expect(dedupeKeyOf("notification.created", { item, unread: 1, live: true })).toBe("item:41");
    expect(dedupeKeyOf("notification.read", { ids: [41] })).toBeNull();
    expect(dedupeKeyOf("unread.changed", { unread: 1 })).toBeNull();
    expect(dedupeKeyOf("notification.created", null)).toBeNull();
  });
});
