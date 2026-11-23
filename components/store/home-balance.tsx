// The home page's balance box (owner, 2026-11-23: it took the place of the quick IMEI check): the available wallet balance of
// the signed-in visitor with the ways on, or an invitation to sign in.
// It reads the session cookies and the wallet (personal, no-store), so the page renders it inside
// <Suspense fallback={<HomeBalanceSkeleton />}>. The reads are the request's shared ones (`getMerchant`, `getCustomer`,
// `readMerchantWallet`, `readCustomerWallet`): the header's account area asks the same questions, so the box costs no API
// call of its own. What shows is decided by `homeBalance` (lib/wallet/home-balance.ts) and drawn by `HomeBalanceView`.
import { readCustomerWallet, readMerchantWallet } from "@/components/layout/account-area";
import { getCustomer, getMerchant } from "@/lib/api/session";
import { store } from "@/lib/i18n/messages/store";
import { homeBalance } from "@/lib/wallet/home-balance";
import { HomeBalanceView } from "./home-balance-view";

export { HomeBalanceSkeleton } from "./home-balance-view";

/**
 * The balance box of this request's visitor. A read that fails shows the state without it (signed out, or no amount):
 * the box never breaks the home page.
 */
export async function HomeBalance() {
  const [merchant, customer, merchantWallet, customerRead] = await Promise.all([
    getMerchant().catch(() => null),
    getCustomer().catch(() => null),
    readMerchantWallet(),
    readCustomerWallet(),
  ]);
  const state = homeBalance({
    merchant,
    merchantWallet,
    customer: customer !== null,
    customerWallet: customerRead.ok ? customerRead.data : null,
  });
  return <HomeBalanceView state={state} t={store.home.balance} />;
}
