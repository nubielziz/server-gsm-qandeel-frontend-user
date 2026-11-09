// CurrencySwitcherSlot: reads the shop's currencies (cached, shared) and the visitor's current one (cookie), then renders
// the client CurrencySwitcher. Wrapped in <Suspense> with a same-size skeleton because the cookie is request data.
import { Suspense } from "react";
import { getStoreConfig } from "@/lib/api/public";
import { getCurrency } from "@/lib/currency";
import { getMessages } from "@/lib/i18n/server";
import { common } from "@/lib/i18n/messages/common";
import { Skeleton } from "@/components/ui/skeleton";
import { CurrencySwitcher } from "./currency-switcher";

async function loadCurrencies() {
  try {
    const [config, current, t] = await Promise.all([getStoreConfig(), getCurrency(), getMessages(common)]);
    return { currencies: config.currencies.map((c) => ({ code: c.code, name: c.name })), current: current.code, label: t.header.currency };
  } catch {
    // The API is unreachable: the header still renders, just without the switcher.
    return null;
  }
}

async function Content({ className }: { className?: string }) {
  const data = await loadCurrencies();
  if (!data || data.currencies.length < 2) return null;
  return <CurrencySwitcher currencies={data.currencies} current={data.current} label={data.label} className={className} />;
}

/** The currency picker for headers and drawers; hides itself when the shop has one currency or the API is down. */
export function CurrencySwitcherSlot({ className }: { className?: string }) {
  return (
    <Suspense fallback={<Skeleton className={className ?? "h-11 w-20 rounded-control"} />}>
      <Content className={className} />
    </Suspense>
  );
}
