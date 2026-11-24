// Who is signed in, read on the server for the current request. There is one kind of account; its rank says which family of
// routes it uses (a merchant rank `/client`, every other rank `/store/v1`). The reader:
// - skips the API call when no readable CSRF cookie exists (no session can exist without one);
// - asks the "me" route of the family the cookie names (the retail rank is refused on the portal route and the other way
//   round, so the right route matters);
// - is deduplicated per request with React `cache` (layouts and pages may all ask);
// - returns `null` when signed out: 401, 403 ACCOUNT_SUSPENDED, 403 IP_NOT_ALLOWED, and 403 RANK_NOT_ALLOWED (a cookie of
//   the other family left over from an older sign-in: the next sign-in sets the right one).
// They read cookies, so render callers behind <Suspense>. Never wrap them in `'use cache'`.
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { accountFamilyFromCookies } from "@/lib/api/account-cookie";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { rankKindOf, type RankKind } from "@/lib/account/family";
import { sitePath } from "@/lib/site-path";
import { isApiError } from "./errors";
import { apiSessionGet } from "./server";
import type { AccountMe } from "./types";

const SIGNED_OUT_CODES = new Set(["UNAUTHORIZED", "ACCOUNT_SUSPENDED", "IP_NOT_ALLOWED", "RANK_NOT_ALLOWED"]);

function signedOut(error: unknown): boolean {
  return isApiError(error) && (error.status === 401 || SIGNED_OUT_CODES.has(error.code));
}

/**
 * The signed-in account (`GET /client/auth/me` or `GET /store/v1/me`, by the cookie's family), or null when signed out.
 * Any other failure (5xx, 429, no answer) is thrown: a caller that must never break on it (a header) catches it itself.
 */
export const getAccount = cache(async (): Promise<AccountMe | null> => {
  const jar = await cookies();
  const family = accountFamilyFromCookies((name) => jar.has(name));
  if (!family) return null;
  try {
    return await apiSessionGet<AccountMe>(FAMILY_ROUTES[family].me);
  } catch (error) {
    if (signedOut(error)) return null;
    throw error;
  }
});

/** Only a path of this site is kept as the place to come back to; anything else is dropped. */
function safeNext(next: string | undefined): string | undefined {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : undefined;
}

/**
 * The sign-in page's address, with `next` (a path of this site) as the place to come back to. There is one sign-in page for
 * every account, so no account type is named.
 */
export function signInPath(next?: string): string {
  const back = safeNext(next);
  return back ? `${sitePath("/sign-in")}?${new URLSearchParams({ next: back }).toString()}` : sitePath("/sign-in");
}

/** The signed-in account, or a redirect to the sign-in page that comes back to `next`. */
export async function requireAccount(next?: string): Promise<AccountMe> {
  const me = await getAccount();
  if (!me) redirect(signInPath(next));
  return me;
}

/**
 * The signed-in account of a rank of this kind. A visitor who is signed out goes to the sign-in page (which comes back to
 * `next`); an account of the other kind goes to the account home, where every account has a page. The kind is read with
 * the fail-closed rule: a rank this code does not know is retail.
 */
export async function requireRank(kind: RankKind, next?: string): Promise<AccountMe> {
  const me = await requireAccount(next);
  if (rankKindOf(me) !== kind) redirect(sitePath("/account"));
  return me;
}
