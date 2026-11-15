// The calls a ticket conversation makes, behind one small interface (feature 28, backend plan §3.2 and §4.2), so the same
// conversation component serves the customer's token page and the merchant's portal thread.
// - Customer (`tokenAdapter`): the token is the whole credential and sits in the path (`/store/v1/tickets/<token>/…`).
// - Merchant (`merchantAdapter`): the session is the credential; a ticket is addressed by its id (a foreign id is a 404).
// Typed by hand from the plan, not from the generated schema (see `lib/api/types.ts`). Import from Client Components only.
import { api } from "@/lib/api/browser";
import type { NotificationSurface } from "@/lib/notifications/link";
import type { Attachment, ClientTicket, Ticket, TicketFile, TicketMessage } from "@/lib/api/types";
import type { TicketSource } from "./conversation";

/** The part of the browser API client the adapters use (a test passes a fake). */
export type TicketHttp = Pick<typeof api, "get" | "post" | "upload">;

/** Where a conversation's live events come from. */
export type TicketStreamSpec =
  /** A stream of its own: one per ticket (the token page). The lock keeps it to one per browser. */
  | { kind: "own"; url: string; lockName: string }
  /** The signed-in surface's stream (the merchant portal): shared by every ticket page of the browser. */
  | { kind: "surface"; surface: NotificationSurface };

export type SendInput = { body: string; fileIds: number[] };

export type TicketAdapter = {
  /** Only a customer's ticket has a rating (merchants have none). */
  supportsRating: boolean;
  /** The merchant's ticket id; absent for a customer (events are matched by number then). */
  ticketId?: number;
  /** `POST …/messages`: the message as the API stored it. */
  send(input: SendInput): Promise<TicketMessage>;
  /** `POST …/read`: the visitor has read support's messages up to this id. */
  read(upToMessageId: number): Promise<void>;
  /** `POST …/typing`: the visitor is typing (the API throttles it; a refusal is harmless). */
  typing(): Promise<void>;
  /** Uploads one file; its id goes in `fileIds` of the message. */
  upload(file: File): Promise<TicketFile>;
  /** The download link of a file of this ticket (a plain link: the API answers 302 to a short-lived address). */
  fileHref(fileId: number): string;
  /** `GET` of the ticket as the page first read it. */
  refetch(): Promise<TicketSource>;
  stream: TicketStreamSpec;
};

/** The body of a message: `fileIds` only when there are files, so a plain message is exactly what it always was. */
export function messageBody(input: SendInput): { body: string; fileIds?: number[] } {
  return input.fileIds.length > 0 ? { body: input.body, fileIds: input.fileIds } : { body: input.body };
}

function fileOf(uploaded: TicketFile | Attachment): TicketFile {
  return { id: uploaded.id, filename: uploaded.filename, size: uploaded.size, mime: uploaded.mime };
}

/** The customer's ticket page: everything goes through the ticket token. */
export function tokenAdapter(token: string, number: string, http: TicketHttp = api): TicketAdapter {
  const base = `/store/v1/tickets/${encodeURIComponent(token)}`;
  return {
    supportsRating: true,
    send: (input) => http.post<TicketMessage>(`${base}/messages`, messageBody(input)),
    read: async (upToMessageId) => {
      await http.post(`${base}/read`, { upToMessageId });
    },
    typing: async () => {
      await http.post(`${base}/typing`);
    },
    upload: async (file) => fileOf(await http.upload<TicketFile>(`${base}/files`, file)),
    fileHref: (fileId) => `${base}/files/${fileId}`,
    refetch: () => http.get<Ticket>(base),
    stream: { kind: "own", url: `${base}/stream`, lockName: `gsm-ticket-${number}` },
  };
}

/** The merchant's thread: the session is the credential and the ticket is addressed by id. */
export function merchantAdapter(id: number, http: TicketHttp = api): TicketAdapter {
  const base = `/client/tickets/${id}`;
  return {
    supportsRating: false,
    ticketId: id,
    send: (input) => http.post<TicketMessage>(`${base}/messages`, messageBody(input)),
    read: async (upToMessageId) => {
      await http.post(`${base}/read`, { upToMessageId });
    },
    typing: async () => {
      await http.post(`${base}/typing`);
    },
    // Merchants upload with the portal's own upload route (any type, 25 MiB); the ticket checks type and size when the
    // files are attached to the message.
    upload: async (file) => fileOf(await http.upload<TicketFile>("/client/files", file)),
    fileHref: (fileId) => `${base}/files/${fileId}`,
    refetch: () => http.get<ClientTicket>(base),
    stream: { kind: "surface", surface: "merchant" },
  };
}
