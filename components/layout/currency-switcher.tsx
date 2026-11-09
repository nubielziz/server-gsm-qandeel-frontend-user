"use client";
// CurrencySwitcher: picks the shop currency. Stores it in the `gsm_currency` cookie (1 year), re-renders the server
// parts with `router.refresh()`, and for a signed-in customer also saves it on the account (PATCH /store/v1/me).
// Server wrapper with the data: CurrencySwitcherSlot (currency-switcher-slot.tsx).
import { useRouter } from "next/navigation";
import { useTransition, type ChangeEvent } from "react";
import { ChevronDown, Coins } from "lucide-react";
import { api, csrfToken } from "@/lib/api/browser";
import { CURRENCY_COOKIE } from "@/lib/i18n/config";
import { cn } from "@/lib/cn";

export type CurrencySwitcherProps = {
  /** Currency codes the shop offers (`StoreConfig.currencies`). */
  currencies: { code: string; name: string }[];
  /** The current currency code. */
  current: string;
  /** Accessible name ("Currency"). */
  label: string;
  className?: string;
};

/** A compact native select of currency codes. */
export function CurrencySwitcher({ currencies, current, label, className }: CurrencySwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const code = event.target.value;
    document.cookie = `${CURRENCY_COOKIE}=${encodeURIComponent(code)}; path=/; max-age=31536000; SameSite=Lax`;
    // A signed-in customer keeps the choice on the account. A failure here must not block the switch.
    if (csrfToken("store")) void api.patch("/store/v1/me", { currency: code }).catch(() => undefined);
    startTransition(() => router.refresh());
  }

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <Coins aria-hidden="true" className="pointer-events-none absolute start-2.5 size-4 text-ink-subtle" />
      <select
        // Uncontrolled + keyed on the server value: the new choice stays visible while the refresh runs, and the
        // select resets to whatever the server renders next.
        key={current}
        aria-label={label}
        aria-busy={pending || undefined}
        defaultValue={current}
        onChange={onChange}
        className="h-11 appearance-none rounded-control bg-transparent ps-8 pe-7 text-body font-semibold text-ink transition-colors hover:bg-surface-sunken disabled:opacity-60"
      >
        {currencies.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute end-2 size-3.5 text-ink-subtle" />
    </div>
  );
}
