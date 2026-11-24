// Which side of the API an account talks to. There is one kind of account; its rank decides what it may do. A rank of the
// merchant kind uses the portal routes under `/client`; every other rank (the retail rank, and any kind this code does
// not know) uses the shop routes under `/store/v1`. This file is the one place that makes that choice.
// Pure and import-free, so the server, the browser and the proxy can all read it. Types are structural: the account
// answer is only asked for the one field the choice needs.

/** The kind of a rank, as the API sends it in `rank.kind`. Only "merchant" carries merchant rights. */
export type RankKind = "retail" | "merchant";

/** The API family an account uses: the shop routes (`/store/v1`) or the portal routes (`/client`). */
export type AccountFamily = "store" | "client";

/** Both families, shop first. */
export const ACCOUNT_FAMILIES: readonly AccountFamily[] = ["store", "client"];

/** The part of an account answer that names its rank. Any answer that carries `rank.kind` fits. */
export type RankSource = { rank?: { kind?: string | null } | null };

/**
 * The kind of the account's rank. Fails closed: only the exact word "merchant" gives the merchant kind; a missing rank,
 * a missing kind, a kind this code has never seen and a signed-out visitor (null) all give "retail".
 */
export function rankKindOf(me: RankSource | null | undefined): RankKind {
  return me?.rank?.kind === "merchant" ? "merchant" : "retail";
}

/**
 * The API family of the account: "client" for a merchant rank, "store" for everything else (fail closed, see
 * `rankKindOf`). The family chooses the routes (`lib/account/routes.ts`), the live-stream lock, the cookie pair and the
 * inbox the account reads; it never chooses a page, because every account has the same pages.
 */
export function familyOf(me: RankSource | null | undefined): AccountFamily {
  return rankKindOf(me) === "merchant" ? "client" : "store";
}
