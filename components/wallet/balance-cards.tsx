// WalletBalanceCards: the balance strip of both wallets (plan D6). It takes the shared field names of
// `GET /client/wallet` and `GET /store/v1/me/wallet` (`available`, `balance`, `reserved`, `creditLimit`), so one component
// serves both account types:
// - merchant: four cards (the dark available card, balance, reserved, credit limit);
// - customer: `reserved` and `creditLimit` are always zero, so their cards are left out; a card for the top-ups still
//   waiting appears when there are any. Amounts are USD.
// Server component, no hooks: the page passes the translated labels.
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n/config";
import { Money } from "@/components/ui/money";
import { StatCard } from "@/components/ui/stat-card";

export type WalletAmounts = {
  balance: string;
  available: string;
  /** Needed only when the reserved card shows. */
  reserved?: string;
  /** Needed only when the credit limit card shows. */
  creditLimit?: string;
};

export type WalletCardLabels = {
  available: string;
  availableHint: string;
  balance: string;
  balanceHint: string;
  reserved?: string;
  reservedHint?: string;
  creditLimit?: string;
  creditLimitHint?: string;
};

export type WalletBalanceCardsProps = {
  locale: Locale;
  amounts: WalletAmounts;
  labels: WalletCardLabels;
  /** Shows the reserved card (merchant). Default: when `amounts.reserved` is given. */
  showReserved?: boolean;
  /** Shows the credit limit card (merchant). Default: when `amounts.creditLimit` is given. */
  showCreditLimit?: boolean;
  /** A line under the hint of the available card (the customer's "about …" in the shop currency). */
  availableNote?: ReactNode;
  /** A button on the dark available card ("Add funds"). */
  availableAction?: ReactNode;
  /** Top-ups still waiting (customer): one more card, shown only when given. */
  pending?: { label: string; amount: string; hint: string };
};

/** Columns of the strip from `xl` up, by number of cards (Tailwind needs the full class names). */
const XL_COLUMNS: Record<number, string> = { 2: "xl:grid-cols-2", 3: "xl:grid-cols-3", 4: "xl:grid-cols-4" };

export function WalletBalanceCards({
  locale,
  amounts,
  labels,
  showReserved = amounts.reserved !== undefined,
  showCreditLimit = amounts.creditLimit !== undefined,
  availableNote,
  availableAction,
  pending,
}: WalletBalanceCardsProps) {
  const count = 2 + (showReserved ? 1 : 0) + (showCreditLimit ? 1 : 0) + (pending ? 1 : 0);
  const money = (amount: string) => <Money amount={amount} currency="USD" locale={locale} />;
  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${XL_COLUMNS[Math.min(4, count)]}`}>
      <StatCard
        tone="inverse"
        label={labels.available}
        value={money(amounts.available)}
        hint={
          availableNote ? (
            <>
              <span className="block">{labels.availableHint}</span>
              <span className="mt-0.5 block">{availableNote}</span>
            </>
          ) : (
            labels.availableHint
          )
        }
        // With three or four cards the dark one takes a whole row on tablets, and one column again on wide screens.
        className={count >= 3 ? "sm:col-span-2 xl:col-span-1" : undefined}
      >
        {availableAction}
      </StatCard>
      <StatCard label={labels.balance} value={money(amounts.balance)} hint={labels.balanceHint} />
      {showReserved && amounts.reserved !== undefined ? (
        <StatCard label={labels.reserved} value={money(amounts.reserved)} hint={labels.reservedHint} />
      ) : null}
      {showCreditLimit && amounts.creditLimit !== undefined ? (
        <StatCard label={labels.creditLimit} value={money(amounts.creditLimit)} hint={labels.creditLimitHint} />
      ) : null}
      {pending ? <StatCard label={pending.label} value={money(pending.amount)} hint={pending.hint} /> : null}
    </div>
  );
}
