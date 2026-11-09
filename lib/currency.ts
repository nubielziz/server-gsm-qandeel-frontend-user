// The shop currency of the current visitor: the `gsm_currency` cookie when the API offers that currency
// (`GET /store/v1/config` currencies), else the base currency (USD). Reads a cookie: call it inside <Suspense>.
// The header's currency switcher writes the cookie (and, for a signed-in customer, PATCH /store/v1/me {currency}).
import { cookies } from "next/headers";
import { CURRENCY_COOKIE } from "@/lib/i18n/config";
import { getStoreConfig } from "@/lib/api/public";
import type { StoreCurrency } from "@/lib/api/types";

export async function getCurrency(): Promise<StoreCurrency> {
  const [jar, config] = await Promise.all([cookies(), getStoreConfig()]);
  const wanted = jar.get(CURRENCY_COOKIE)?.value?.toUpperCase();
  return (
    config.currencies.find((c) => c.code === wanted) ??
    config.currencies.find((c) => c.code === config.baseCurrency) ?? {
      code: config.baseCurrency,
      name: config.baseCurrency,
      decimals: 2,
      fxRate: "1.00000000",
    }
  );
}
