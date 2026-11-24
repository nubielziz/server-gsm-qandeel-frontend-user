// The signed-in account's wallet, read once per request for every part of the page that shows it (the header pill, the
// frame's wallet item, the home box, the checkout, the wallet pages). An account has one live wallet, of the kind of its
// rank: a retail rank has the store balance (`GET /store/v1/me/wallet`, always USD), a merchant rank the portal wallet
// (`GET /client/wallet`). The read asks who is signed in first and then exactly one wallet route, so the other family's
// route (which refuses the rank with 403 RANK_NOT_ALLOWED) is never called.
// It reads cookies: render the caller behind <Suspense>. Never wrap it in `'use cache'`.
import { cache } from "react";
import { familyOf } from "@/lib/account/family";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { apiSessionGet } from "@/lib/api/server";
import { getAccount } from "@/lib/api/session";
import type { CustomerWallet, MerchantWallet } from "@/lib/api/types";
import { settle, type Settled } from "@/lib/merchant/load";

/** The wallet of the signed-in account, by the kind of wallet its rank has. */
export type AccountWalletRead =
  { kind: "store"; read: Settled<CustomerWallet> } | { kind: "merchant"; read: Settled<MerchantWallet> };

/**
 * The wallet of the signed-in account, or null when nobody is signed in. The wallet itself is kept as a result, so a header
 * can ignore a failure while the wallet page shows it with the request reference. A failure to tell who is signed in (the
 * API is down) is thrown, as `getAccount` throws it: a caller that must never break catches it. One read per request;
 * every caller of the request shares it.
 */
export const readAccountWallet = cache(async (): Promise<AccountWalletRead | null> => {
  const me = await getAccount();
  if (!me) return null;
  if (familyOf(me) === "client") {
    return { kind: "merchant", read: await settle(apiSessionGet<MerchantWallet>(FAMILY_ROUTES.client.wallet)) };
  }
  return { kind: "store", read: await settle(apiSessionGet<CustomerWallet>(FAMILY_ROUTES.store.wallet)) };
});
