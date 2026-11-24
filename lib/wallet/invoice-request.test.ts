// The Add funds request of a merchant rank: the key it carries, when the key is forgotten, and where the answer leads.
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { createIdempotencyKeys } from "@/lib/api/idempotency";
import type { InvoiceCreated } from "@/lib/api/types";
import {
  INVOICES_PATH,
  afterInvoice,
  createInvoice,
  forgetsInvoiceKey,
  invoiceSignature,
  submitInvoice,
  type PostInvoice,
} from "./invoice-request";

const invoice = (id: number, over: Partial<InvoiceCreated> = {}): InvoiceCreated => ({
  invoice: { id, number: `INV-2026-${String(id).padStart(4, "0")}` } as InvoiceCreated["invoice"],
  ...over,
});

/** A fake `api.post` that records every call and answers the next prepared answer (or throws it). */
function fakePost(...answers: (InvoiceCreated | Error)[]) {
  const calls: { path: string; body: unknown; key: string }[] = [];
  const post: PostInvoice = async (path, body, options) => {
    calls.push({ path, body, key: options.idempotencyKey });
    const answer = answers[calls.length - 1] ?? answers[answers.length - 1];
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { post, calls };
}

const counter = () => {
  let n = 0;
  return () => `key-${++n}`;
};
const input = { amount: "250.00", gatewayId: 3 };

describe("the Add funds request of a merchant rank", () => {
  it("posts to the invoices route with an Idempotency-Key", async () => {
    const { post, calls } = fakePost(invoice(7));
    await createInvoice(post, createIdempotencyKeys(counter()), input);
    expect(INVOICES_PATH).toBe("/client/invoices");
    expect(calls).toEqual([{ path: "/client/invoices", body: { amount: "250.00", gatewayId: 3 }, key: "key-1" }]);
  });

  it("keeps the key through a failure, so a retry or a double click replays the same invoice", async () => {
    const { post, calls } = fakePost(new ApiError({ status: 502, code: "GATEWAY_ERROR" }), invoice(7));
    const keys = createIdempotencyKeys(counter());
    await expect(createInvoice(post, keys, input)).rejects.toMatchObject({ code: "GATEWAY_ERROR" });
    await createInvoice(post, keys, input);
    expect(calls.map((call) => call.key)).toEqual(["key-1", "key-1"]);
  });

  it("takes a new key as soon as the amount or the method changes", async () => {
    const { post, calls } = fakePost(new ApiError({ status: 502, code: "GATEWAY_ERROR" }));
    const keys = createIdempotencyKeys(counter());
    for (const next of [input, { ...input, amount: "300.00" }, { ...input, amount: "300.00", gatewayId: 4 }]) {
      await createInvoice(post, keys, next).catch(() => undefined);
    }
    expect(calls.map((call) => call.key)).toEqual(["key-1", "key-2", "key-3"]);
    expect(invoiceSignature(input)).not.toBe(invoiceSignature({ ...input, gatewayId: 4 }));
  });

  it("forgets the key after a success: the next invoice for the same amount is a new one on purpose", async () => {
    const { post, calls } = fakePost(invoice(7), invoice(8));
    const keys = createIdempotencyKeys(counter());
    await createInvoice(post, keys, input);
    await createInvoice(post, keys, input);
    expect(calls.map((call) => call.key)).toEqual(["key-1", "key-2"]);
  });

  it("forgets the key only when the API says it was used for another body", () => {
    expect(forgetsInvoiceKey(new ApiError({ status: 409, code: "IDEMPOTENCY_KEY_REUSED" }))).toBe(true);
    expect(forgetsInvoiceKey(new ApiError({ status: 409, code: "IDEMPOTENCY_IN_PROGRESS" }))).toBe(false);
    expect(forgetsInvoiceKey(new ApiError({ status: 422, code: "VALIDATION_FAILED" }))).toBe(false);
    expect(forgetsInvoiceKey(new Error("network"))).toBe(false);
    expect(forgetsInvoiceKey(undefined)).toBe(false);
  });
});

describe("where a new invoice leads", () => {
  const base = "/en/account/invoices";

  it("sends a manual method to the invoice page in the account area (instructions and the receipt upload)", () => {
    expect(afterInvoice(invoice(42), base)).toEqual({ kind: "invoice", href: "/en/account/invoices/42" });
  });

  it("sends an online method to the payment provider", () => {
    expect(afterInvoice(invoice(42, { paymentUrl: "https://pay.example.test/session/abc" }), base)).toEqual({
      kind: "pay",
      url: "https://pay.example.test/session/abc",
    });
  });

  it("never follows an address that is not http or https", () => {
    for (const paymentUrl of ["javascript:alert(1)", "data:text/html,x", "not a url"]) {
      expect(afterInvoice(invoice(42, { paymentUrl }), base)).toEqual({ kind: "unsafe-url" });
    }
  });

  it("submits the form in one step: the key, the invoice and where it leads", async () => {
    const { post, calls } = fakePost(invoice(42));
    const done = await submitInvoice(post, createIdempotencyKeys(counter()), input, base);
    expect(done.next).toEqual({ kind: "invoice", href: "/en/account/invoices/42" });
    expect(done.created.invoice.id).toBe(42);
    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe("key-1");
  });
});
