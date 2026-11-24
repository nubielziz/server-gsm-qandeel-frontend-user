// The home page's balance box (owner, 2026-11-23: it took the place of the quick IMEI check): the available wallet balance of
// the signed-in account with the ways on, or an invitation to sign in.
// It reads the session cookies and the wallet (personal, no-store), so the page renders it inside
// <Suspense fallback={<HomeBalanceSkeleton />}>. The read is the request's shared one (`readAccountWallet`): the header's
// account area asks the same question, so the box costs no API call of its own. What shows is decided by `homeBalance`
// (lib/wallet/home-balance.ts) and drawn by `HomeBalanceView`.
import { readAccountWallet } from "@/lib/account/wallet-read";
import { store } from "@/lib/i18n/messages/store";
import { homeBalance } from "@/lib/wallet/home-balance";
import { HomeBalanceView } from "./home-balance-view";

export { HomeBalanceSkeleton } from "./home-balance-view";

/**
 * The balance box of this request's visitor. A read that fails shows the state without it (signed out, or no amount):
 * the box never breaks the home page.
 */
export async function HomeBalance() {
  const wallet = await readAccountWallet().catch(() => null);
  return <HomeBalanceView state={homeBalance(wallet)} t={store.home.balance} />;
}
