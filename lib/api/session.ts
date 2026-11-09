// Who is signed in, read on the server for the current request. Merchant and customer sessions are separate and can
// both exist in one browser (handoff §3.6). Each reader:
// - skips the API call when that surface's readable CSRF cookie is absent (no session can exist without it);
// - is deduplicated per request with React `cache` (layouts and pages may all ask);
// - returns `null` when signed out: 401, and also 403 ACCOUNT_SUSPENDED / IP_NOT_ALLOWED (handoff §3.4).
// They read cookies, so render callers behind <Suspense>. Never wrap them in `'use cache'`.
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isApiError } from "./errors";
import { apiSessionGet } from "./server";
import type { MerchantMe, StoreMe } from "./types";
import { localePath, type Locale } from "@/lib/i18n/config";

export const MERCHANT_CSRF_COOKIE = "csrf_token_client";
export const STORE_CSRF_COOKIE = "csrf_token_store";

const SIGNED_OUT_CODES = new Set(["UNAUTHORIZED", "ACCOUNT_SUSPENDED", "IP_NOT_ALLOWED"]);

function signedOut(error: unknown): boolean {
  return isApiError(error) && (error.status === 401 || SIGNED_OUT_CODES.has(error.code));
}

/** The signed-in merchant (`GET /client/auth/me`), or null. A pending (not yet approved) merchant is returned too. */
export const getMerchant = cache(async (): Promise<MerchantMe | null> => {
  const jar = await cookies();
  if (!jar.has(MERCHANT_CSRF_COOKIE)) return null;
  try {
    return await apiSessionGet<MerchantMe>("/client/auth/me");
  } catch (error) {
    if (signedOut(error)) return null;
    throw error;
  }
});

/** The signed-in customer (`GET /store/v1/me`), or null. */
export const getCustomer = cache(async (): Promise<StoreMe | null> => {
  const jar = await cookies();
  if (!jar.has(STORE_CSRF_COOKIE)) return null;
  try {
    return await apiSessionGet<StoreMe>("/store/v1/me");
  } catch (error) {
    if (signedOut(error)) return null;
    throw error;
  }
});

function signInPath(locale: Locale, as: "merchant" | "customer", next?: string): string {
  const params = new URLSearchParams({ as });
  if (next && next.startsWith("/") && !next.startsWith("//")) params.set("next", next);
  return `${localePath(locale, "/sign-in")}?${params.toString()}`;
}

/** The signed-in merchant, or a redirect to the sign-in page (merchant tab) that comes back to `next`. */
export async function requireMerchant(locale: Locale, next?: string): Promise<MerchantMe> {
  const me = await getMerchant();
  if (!me) redirect(signInPath(locale, "merchant", next));
  return me;
}

/** The signed-in customer, or a redirect to the sign-in page (customer tab) that comes back to `next`. */
export async function requireCustomer(locale: Locale, next?: string): Promise<StoreMe> {
  const me = await getCustomer();
  if (!me) redirect(signInPath(locale, "customer", next));
  return me;
}
