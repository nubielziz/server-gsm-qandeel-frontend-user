// The calls a ticket conversation makes, behind one small interface (feature 28, backend plan §3.2 and §4.2), so the same
// conversation component serves the token page and the signed-in thread of a merchant rank.
// - Token page (`tokenAdapter`): the token is the whole credential and sits in the path (`/store/v1/tickets/<token>/…`). A
//   guest and a retail account open their tickets here.
// - Signed-in thread (`clientAdapter`): the session is the credential; a ticket is addressed by its id (a foreign id is a
//   404). A merchant rank's tickets open here, at `/account/support/<id>`.
// Typed by hand from the plan, not from the generated schema (see `lib/api/types.ts`). Import from Client Components only.
import { api } from "@/lib/api/browser";
import type { AccountFamily } from "@/lib/account/family";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import type { Attachment, ClientTicket, Ticket, TicketFile, TicketMessage } from "@/lib/api/types";
import type { TicketSource } from "./conversation";

/** The part of the browser API client the adapters use (a test passes a fake). */
export type TicketHttp = Pick<typeof api, "get" | "post" | "upload">;

/** Where a conversation's live events come from. */
export type TicketStreamSpec =
  /** A stream of its own: one per ticket (the token page). The lock keeps it to one per browser. */
  | { kind: "own"; url: string; lockName: string }
  /** The stream of the signed-in account's family: shared by every ticket page of the browser. */
  | { kind: "family"; family: AccountFamily };

export type SendInput = { body: string; fileIds: number[] };

export type TicketAdapter = {
  /** The ticket id of a signed-in thread; absent on the token page (events are matched by number then). */
  ticketId?: number;
  /** `POST …/messages`: the message as the API stored it. */
  send(input: SendInput): Promise<TicketMessage>;
  /** `POST …/read`: the visitor has read support's messages up to this id. */
  read(upToMessageId: number): Promise<void>;
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

/** The token page of a ticket: everything goes through the ticket token. */
export function tokenAdapter(token: string, number: string, http: TicketHttp = api): TicketAdapter {
  const base = `/store/v1/tickets/${encodeURIComponent(token)}`;
  return {
    send: (input) => http.post<TicketMessage>(`${base}/messages`, messageBody(input)),
    read: async (upToMessageId) => {
      await http.post(`${base}/read`, { upToMessageId });
    },
    upload: async (file) => fileOf(await http.upload<TicketFile>(`${base}/files`, file)),
    fileHref: (fileId) => `${base}/files/${fileId}`,
    refetch: () => http.get<Ticket>(base),
    stream: { kind: "own", url: `${base}/stream`, lockName: `gsm-ticket-${number}` },
  };
}

/** The signed-in thread of a merchant rank: the session is the credential and the ticket is addressed by id. */
export function clientAdapter(id: number, http: TicketHttp = api): TicketAdapter {
  const base = `${FAMILY_ROUTES.client.tickets}/${id}`;
  return {
    ticketId: id,
    send: (input) => http.post<TicketMessage>(`${base}/messages`, messageBody(input)),
    read: async (upToMessageId) => {
      await http.post(`${base}/read`, { upToMessageId });
    },
    // The thread uploads with the portal family's own upload route (any type, 25 MiB); the ticket checks type and size when
    // the files are attached to the message.
    upload: async (file) => fileOf(await http.upload<TicketFile>(FAMILY_ROUTES.client.files, file)),
    fileHref: (fileId) => `${base}/files/${fileId}`,
    refetch: () => http.get<ClientTicket>(base),
    stream: { kind: "family", family: "client" },
  };
}
