// Money: shows a 4-decimal money string with tabular figures. Never parses to a float (lib/format `formatMoney`).
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

export type MoneyProps = {
  /** The API's money string, e.g. "12.4900". */
  amount: string;
  /** ISO 4217 code ("USD"). */
  currency: string;
  /** Display decimals from `/store/v1/config` currencies (0-4); omit for the currency's usual digits. */
  decimals?: number;
  className?: string;
};

/** A formatted amount in tabular figures. Always laid out left-to-right (digits and symbol stay in order inside the sentence). */
export function Money({ amount, currency, decimals, className }: MoneyProps) {
  return (
    <span dir="ltr" className={cn("num inline-block whitespace-nowrap", className)}>
      {formatMoney(amount, currency, decimals)}
    </span>
  );
}
