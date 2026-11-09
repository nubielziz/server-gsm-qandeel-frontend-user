// An amount with an explicit sign and a colour (green in, red out). The sign carries the meaning, the colour only helps.
import { Money } from "@/components/ui/money";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/cn";

export function SignedMoney({ amount, currency = "USD", locale }: { amount: string; currency?: string; locale: Locale }) {
  const negative = amount.startsWith("-");
  const zero = /^-?0+(\.0+)?$/.test(amount);
  return (
    <span dir="ltr" className={cn("inline-block whitespace-nowrap font-semibold", zero ? "text-ink" : negative ? "text-danger-ink" : "text-success-ink")}>
      {!negative && !zero ? "+" : null}
      <Money amount={amount} currency={currency} locale={locale} />
    </span>
  );
}
