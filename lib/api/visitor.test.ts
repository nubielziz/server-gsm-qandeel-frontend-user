// apiVisitorGet / apiVisitorList (lib/api/server.ts): a search read for one visitor forwards the visitor's address, the
// User-Agent and the prefetch headers, never cookies, and waits for a real request (`connection()`).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({
  headers: new Headers(),
  cookies: "gsm_session=secret; csrf_token_store=abc",
  connection: vi.fn(async () => {}),
}));

vi.mock("next/headers", () => ({
  headers: async () => request.headers,
  cookies: async () => ({ toString: () => request.cookies }),
}));
vi.mock("next/server", () => ({ connection: request.connection }));

import { VISITOR_HEADERS, apiPublicGet, apiSessionGet, apiVisitorGet, apiVisitorList } from "./server";

let sent: Headers[] = [];
let urls: string[] = [];

beforeEach(() => {
  sent = [];
  urls = [];
  request.connection.mockClear();
  request.headers = new Headers({
    "x-forwarded-for": "203.0.113.7",
    "user-agent": "Mozilla/5.0 (test)",
    "next-router-prefetch": "1",
    purpose: "prefetch",
    "sec-purpose": "prefetch",
    cookie: "gsm_session=secret",
    "accept-language": "en",
    authorization: "Bearer nope",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      urls.push(url);
      sent.push(new Headers(init.headers));
      return new Response(JSON.stringify([{ id: 1 }]), { status: 200, headers: { "x-total-count": "7" } });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("apiVisitorGet", () => {
  it("forwards the address, the User-Agent and the prefetch headers, and nothing else of the request", async () => {
    await apiVisitorGet("/store/v1/search", { query: { q: "samsung", currency: "USD" } });
    expect(urls[0]).toMatch(/\/store\/v1\/search\?q=samsung&currency=USD$/);
    const headers = sent[0];
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.7");
    expect(headers.get("user-agent")).toBe("Mozilla/5.0 (test)");
    expect(headers.get("next-router-prefetch")).toBe("1");
    expect(headers.get("purpose")).toBe("prefetch");
    expect(headers.get("sec-purpose")).toBe("prefetch");
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("accept-language")).toBeNull();
    expect([...headers.keys()].sort()).toEqual(["accept", "x-forwarded-for", ...VISITOR_HEADERS].sort());
  });

  it("waits for a real request first (never prerendered, never cached)", async () => {
    await apiVisitorGet("/store/v1/search");
    expect(request.connection).toHaveBeenCalledTimes(1);
  });

  it("falls back to X-Real-IP, and sends no address when there is none", async () => {
    request.headers = new Headers({ "x-real-ip": "198.51.100.2" });
    await apiVisitorGet("/store/v1/search");
    request.headers = new Headers();
    await apiVisitorGet("/store/v1/search");
    expect(sent[0].get("x-forwarded-for")).toBe("198.51.100.2");
    expect(sent[1].get("x-forwarded-for")).toBeNull();
  });

  it("the list form reads the total from x-total-count", async () => {
    await expect(apiVisitorList("/store/v1/services", { query: { q: "x" } })).resolves.toEqual({ data: [{ id: 1 }], total: 7 });
  });
});

describe("the other kinds keep their rules", () => {
  it("a public read sends nothing of the request; a session read sends the cookies and the address", async () => {
    await apiPublicGet("/store/v1/config");
    await apiSessionGet("/store/v1/me");
    expect(sent[0].get("cookie")).toBeNull();
    expect(sent[0].get("x-forwarded-for")).toBeNull();
    expect(sent[0].get("user-agent")).toBeNull();
    expect(sent[1].get("cookie")).toBe(request.cookies);
    expect(sent[1].get("x-forwarded-for")).toBe("203.0.113.7");
    expect(sent[1].get("user-agent")).toBeNull();
  });
});
