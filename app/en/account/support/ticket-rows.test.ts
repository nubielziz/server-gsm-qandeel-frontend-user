import { describe, expect, it } from "vitest";
import type { ClientTicketRow, MyTicketRow } from "@/lib/api/types";
import { clientTicketRows, storeTicketRows } from "./ticket-rows";

const base = {
  number: "T-41",
  subject: "My unlock is taking long",
  category: "delay",
  status: "open",
  orderId: 7,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-02T10:00:00.000Z",
  lastMessageAt: "2026-11-02T09:00:00.000Z",
  lastMessageFrom: "support",
  hasUnread: true,
} as const;

const storeRow: MyTicketRow = { ...base, token: "tok_A1-b2" };
const clientRow: ClientTicketRow = { ...base, id: 12 };

describe("storeTicketRows (a retail account)", () => {
  it("opens the token page of the ticket and keys the row by the token", () => {
    const [row] = storeTicketRows([storeRow]);
    expect(row.href).toBe("/en/support/tickets/tok_A1-b2");
    expect(row.key).toBe("tok_A1-b2");
  });

  it("encodes a token that is not URL-safe", () => {
    const [row] = storeTicketRows([{ ...storeRow, token: "a/b c?d" }]);
    expect(row.href).toBe("/en/support/tickets/a%2Fb%20c%3Fd");
  });

  it("copies what the list shows and nothing it should not", () => {
    const [row] = storeTicketRows([storeRow]);
    expect(row).toEqual({
      key: "tok_A1-b2",
      href: "/en/support/tickets/tok_A1-b2",
      number: "T-41",
      subject: "My unlock is taking long",
      category: "delay",
      status: "open",
      updatedAt: "2026-11-02T10:00:00.000Z",
      lastMessageAt: "2026-11-02T09:00:00.000Z",
      lastMessageFrom: "support",
      hasUnread: true,
    });
  });

  it("keeps the order of the rows and gives none for none", () => {
    expect(storeTicketRows([])).toEqual([]);
    const rows = storeTicketRows([storeRow, { ...storeRow, token: "second", number: "T-40" }]);
    expect(rows.map((row) => row.number)).toEqual(["T-41", "T-40"]);
  });
});

describe("clientTicketRows (a merchant rank)", () => {
  it("opens the live thread of the account area, addressed by the id", () => {
    const [row] = clientTicketRows([clientRow]);
    expect(row.href).toBe("/en/account/support/12");
    expect(row.key).toBe(12);
  });

  it("has the same fields as the other kind, apart from the key and the link", () => {
    const [store] = storeTicketRows([storeRow]);
    const [client] = clientTicketRows([clientRow]);
    const { key: storeKey, href: storeHref, ...storeRest } = store;
    const { key: clientKey, href: clientHref, ...clientRest } = client;
    expect(clientRest).toEqual(storeRest);
    expect([storeKey, storeHref]).not.toEqual([clientKey, clientHref]);
  });

  it("never links to the old portal folder", () => {
    for (const row of [...clientTicketRows([clientRow]), ...storeTicketRows([storeRow])])
      expect(row.href).not.toContain("/merchant");
  });
});
