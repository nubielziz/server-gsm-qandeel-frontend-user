import { describe, expect, it, vi } from "vitest";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { clientAdapter, messageBody, tokenAdapter, type TicketHttp } from "./ticket-api";

function fakeHttp() {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const http = {
    get: vi.fn(async (path: string) => {
      calls.push({ method: "GET", path });
      return { number: "T-1" };
    }),
    post: vi.fn(async (path: string, body?: unknown) => {
      calls.push({ method: "POST", path, body });
      return { id: 5, from: "you", body: "ok", createdAt: "2026-11-15T10:00:00.000Z" };
    }),
    upload: vi.fn(async (path: string, file: File) => {
      calls.push({ method: "UPLOAD", path, body: file.name });
      return { id: 77, filename: file.name, size: 3, mime: "application/pdf", extra: "dropped" };
    }),
  };
  return { http: http as unknown as TicketHttp, calls };
}

describe("messageBody", () => {
  it("is exactly the old body for a message with no files", () => {
    expect(messageBody({ body: "hi", fileIds: [] })).toEqual({ body: "hi" });
    expect("fileIds" in messageBody({ body: "hi", fileIds: [] })).toBe(false);
  });

  it("carries fileIds when there are files, and an empty text for a files-only message", () => {
    expect(messageBody({ body: "see", fileIds: [3, 4] })).toEqual({ body: "see", fileIds: [3, 4] });
    expect(messageBody({ body: "", fileIds: [3] })).toEqual({ body: "", fileIds: [3] });
  });
});

describe("tokenAdapter (the token page)", () => {
  const token = "tok/with+odd chars";
  const base = `/store/v1/tickets/${encodeURIComponent(token)}`;

  it("addresses every call by the encoded token", async () => {
    const { http, calls } = fakeHttp();
    const adapter = tokenAdapter(token, "T-1042", http);
    await adapter.send({ body: "hello", fileIds: [] });
    await adapter.send({ body: "", fileIds: [9] });
    await adapter.read(12);
    await adapter.refetch();
    expect(calls).toEqual([
      { method: "POST", path: `${base}/messages`, body: { body: "hello" } },
      { method: "POST", path: `${base}/messages`, body: { body: "", fileIds: [9] } },
      { method: "POST", path: `${base}/read`, body: { upToMessageId: 12 } },
      { method: "GET", path: base },
    ]);
  });

  it("uploads to the ticket's own file route and keeps only the file's own fields", async () => {
    const { http, calls } = fakeHttp();
    const adapter = tokenAdapter(token, "T-1042", http);
    const uploaded = await adapter.upload(new File(["abc"], "scan.pdf", { type: "application/pdf" }));
    expect(calls).toEqual([{ method: "UPLOAD", path: `${base}/files`, body: "scan.pdf" }]);
    expect(uploaded).toEqual({ id: 77, filename: "scan.pdf", size: 3, mime: "application/pdf" });
  });

  it("links a file to the download route and names the stream by the ticket number", () => {
    const adapter = tokenAdapter(token, "T-1042", fakeHttp().http);
    expect(adapter.fileHref(5)).toBe(`${base}/files/5`);
    expect(adapter.stream).toEqual({ kind: "own", url: `${base}/stream`, lockName: "gsm-ticket-T-1042" });
    expect(adapter.ticketId).toBeUndefined();
  });

  it("a read that fails rejects, so the caller can retry it", async () => {
    const http = { ...fakeHttp().http, post: vi.fn().mockRejectedValue(new Error("429")) } as unknown as TicketHttp;
    await expect(tokenAdapter(token, "T-1", http).read(1)).rejects.toThrow("429");
  });

  it("has no rating and no typing call: only messages, read marks, files and the ticket itself", () => {
    expect(Object.keys(tokenAdapter(token, "T-1", fakeHttp().http)).sort()).toEqual(
      ["fileHref", "read", "refetch", "send", "stream", "upload"].sort(),
    );
  });
});

describe("clientAdapter (the signed-in thread)", () => {
  it("addresses calls by the ticket id; the session is the credential", async () => {
    const { http, calls } = fakeHttp();
    const adapter = clientAdapter(42, http);
    await adapter.send({ body: "hello", fileIds: [] });
    await adapter.read(8);
    await adapter.refetch();
    expect(calls).toEqual([
      { method: "POST", path: "/client/tickets/42/messages", body: { body: "hello" } },
      { method: "POST", path: "/client/tickets/42/read", body: { upToMessageId: 8 } },
      { method: "GET", path: "/client/tickets/42" },
    ]);
  });

  it("uploads to the client family's file route, the one of the route table", async () => {
    const { http, calls } = fakeHttp();
    const adapter = clientAdapter(42, http);
    const uploaded = await adapter.upload(new File(["abc"], "scan.pdf", { type: "application/pdf" }));
    expect(calls).toEqual([{ method: "UPLOAD", path: "/client/files", body: "scan.pdf" }]);
    expect(FAMILY_ROUTES.client.files).toBe("/client/files");
    expect(uploaded).toEqual({ id: 77, filename: "scan.pdf", size: 3, mime: "application/pdf" });
  });

  it("downloads through the ticket, and listens on the stream of the client family", () => {
    const adapter = clientAdapter(42, fakeHttp().http);
    expect(adapter.fileHref(5)).toBe("/client/tickets/42/files/5");
    expect(adapter.stream).toEqual({ kind: "family", family: "client" });
    expect(adapter.ticketId).toBe(42);
  });

  it("has no typing call either", () => {
    expect(Object.keys(clientAdapter(42, fakeHttp().http)).sort()).toEqual(
      ["fileHref", "read", "refetch", "send", "stream", "ticketId", "upload"].sort(),
    );
  });
});
