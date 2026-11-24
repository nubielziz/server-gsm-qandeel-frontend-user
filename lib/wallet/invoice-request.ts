// What the Add funds form of a merchant rank sends and what it does with the answer, as pure functions (no React, no cookies,
// no fetch of its own: the caller passes the browser client's `post`), so the rules are unit-tested. A merchant rank adds funds by
// creating an invoice (`POST /client/invoices`); the request carries an `Idempotency-Key`, so a double click or a retry makes one
// invoice and not two.
// The key follows the rules of `createIdempotencyKeys` (lib/api/idempotency.ts): the same key for the same amount and method, a
// new one as soon as either changes, forgotten after a success and after 409 IDEMPOTENCY_KEY_REUSED; kept after any other
// failure (the API stores nothing for a refusal) and after 409 IDEMPOTENCY_IN_PROGRESS (the same request is still running).
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { isApiError } from "@/lib/api/errors";
import type { IdempotencyKeys } from "@/lib/api/idempotency";
import type { InvoiceCreated } from "@/lib/api/types";
import { isHttpUrl } from "@/lib/merchant/format";

/** The route that creates an invoice. */
export const INVOICES_PATH = FAMILY_ROUTES.client.invoices;

/** What the form sends: a 4-decimal amount in US dollars and the id of the chosen payment method. */
export type InvoiceInput = { amount: string; gatewayId: number };

/** The browser client's `api.post`, as far as this module needs it. */
export type PostInvoice = (path: string, body: InvoiceInput, options: { idempotencyKey: string }) => Promise<InvoiceCreated>;

/** Identifies one request: the same text for the same amount and method, another text as soon as either changes. */
export function invoiceSignature(input: InvoiceInput): string {
  return JSON.stringify([input.amount, input.gatewayId]);
}

/**
 * Creates the invoice with the key of this request. The key is forgotten after the answer, so the next create (another invoice
 * for the same amount, on purpose) takes a new one. A failure keeps the key and rethrows: the caller decides with
 * `forgetsInvoiceKey` whether to forget it.
 */
export async function createInvoice(post: PostInvoice, keys: IdempotencyKeys, input: InvoiceInput): Promise<InvoiceCreated> {
  const created = await post(
    INVOICES_PATH,
    { amount: input.amount, gatewayId: input.gatewayId },
    { idempotencyKey: keys.keyFor(invoiceSignature(input)) },
  );
  keys.reset();
  return created;
}

/**
 * True when the key of a failed create must be forgotten: the key was used for another body (409 IDEMPOTENCY_KEY_REUSED), so a
 * retry with it would fail the same way. Every other failure keeps the key.
 */
export function forgetsInvoiceKey(error: unknown): boolean {
  return isApiError(error) && error.code === "IDEMPOTENCY_KEY_REUSED";
}

/** What to do once the invoice exists. */
export type AfterInvoice =
  /** An online method: the browser goes to the provider's page. */
  | { kind: "pay"; url: string }
  /** The provider's address is not an http or https address: show the refusal, never follow it. */
  | { kind: "unsafe-url" }
  /** A manual method: the invoice's own page (instructions and the receipt upload). */
  | { kind: "invoice"; href: string };

/**
 * Where an invoice that was just created leads. `invoiceBase` is the invoices page of the account area (`/en/account/invoices`);
 * a manual method goes to `${invoiceBase}/<id>`, an online one to `paymentUrl` when it is an http or https address.
 */
export function afterInvoice(created: InvoiceCreated, invoiceBase: string): AfterInvoice {
  if (created.paymentUrl)
    return isHttpUrl(created.paymentUrl) ? { kind: "pay", url: created.paymentUrl } : { kind: "unsafe-url" };
  return { kind: "invoice", href: `${invoiceBase}/${created.invoice.id}` };
}

/**
 * The whole submit of the form: create the invoice with the key of this request, then say where the answer leads. A failure
 * keeps the key and rethrows, as `createInvoice` does.
 */
export async function submitInvoice(
  post: PostInvoice,
  keys: IdempotencyKeys,
  input: InvoiceInput,
  invoiceBase: string,
): Promise<{ created: InvoiceCreated; next: AfterInvoice }> {
  const created = await createInvoice(post, keys, input);
  return { created, next: afterInvoice(created, invoiceBase) };
}
