// The overview every account has: the same address for every rank, a different body for each kind. A merchant rank gets its
// dashboard, every other rank (an unknown kind included: the choice fails closed) the retail overview. Server component:
// render it behind <Suspense>, it reads the session.
import { familyOf } from "@/lib/account/family";
import { requireAccount } from "@/lib/api/session";
import { sitePath } from "@/lib/site-path";
import { MerchantOverview } from "./merchant-overview";
import { RetailOverview } from "./retail-overview";

export async function AccountOverview() {
  const me = await requireAccount(sitePath("/account"));
  return familyOf(me) === "client" ? <MerchantOverview me={me} /> : <RetailOverview me={me} />;
}
