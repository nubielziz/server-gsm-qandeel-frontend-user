// CurrencySwitcherSlot: reads the shop's currencies (cached, shared), the visitor's current one (cookie) and whether the
// signed-in account keeps its choice (a retail rank does), then renders the client CurrencySwitcher. Wrapped in <Suspense>
// with a same-size skeleton because the cookie is request data.
import { Suspense } from "react";
import { savesCurrencyToAccount } from "@/lib/account/account-menu";
import { getStoreConfig } from "@/lib/api/public";
import { getAccount } from "@/lib/api/session";
import { getCurrency } from "@/lib/currency";
import { common } from "@/lib/i18n/messages/common";
import { Skeleton } from "@/components/ui/skeleton";
import { CurrencySwitcher } from "./currency-switcher";

async function loadCurrencies() {
  try {
    // The account read is the request's shared one (the header asks it too). A failure only means the choice stays in the cookie.
    const [config, current, me] = await Promise.all([getStoreConfig(), getCurrency(), getAccount().catch(() => null)]);
    const t = common;
    return {
      currencies: config.currencies.map((c) => ({ code: c.code, name: c.name })),
      current: current.code,
      label: t.header.currency,
      saveToAccount: savesCurrencyToAccount(me),
    };
  } catch {
    // The API is unreachable: the header still renders, just without the switcher.
    return null;
  }
}

async function Content({ className }: { className?: string }) {
  const data = await loadCurrencies();
  if (!data || data.currencies.length < 2) return null;
  return (
    <CurrencySwitcher
      currencies={data.currencies}
      current={data.current}
      label={data.label}
      saveToAccount={data.saveToAccount}
      className={className}
    />
  );
}

/** The currency picker for headers and drawers; hides itself when the shop has one currency or the API is down. */
export function CurrencySwitcherSlot({ className }: { className?: string }) {
  return (
    <Suspense fallback={<Skeleton className={className ?? "h-11 w-20 rounded-control"} />}>
      <Content className={className} />
    </Suspense>
  );
}
