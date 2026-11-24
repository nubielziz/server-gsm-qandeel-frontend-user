// PriceBlock: the price of one unit of a service with the notes a buyer needs ("per unit", "From", "{N} for", the packs). The
// service page and the quick view draw it with the public price on the server, and the personal price layer
// (components/store/own-price.tsx) draws it in the browser with a merchant's own price, so it holds no server code.
import type { ReactNode } from "react";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import type { CommonMessages } from "@/lib/i18n/messages/common";
import type { StoreMessages } from "@/lib/i18n/messages/store";
import type { QuantityRule } from "@/lib/quantity";
import { priceNotes } from "./card-labels";

/** Fills `{price}` of a sentence with a Money: it is laid out left-to-right, so the amount keeps its order inside the sentence. */
function WithMoney({ template, amount, currency, decimals }: { template: string; amount: string; currency: string; decimals: number }) {
  const marker = "{price}";
  const at = template.indexOf(marker);
  if (at < 0) return template;
  return (
    <>
      {template.slice(0, at)}
      <Money amount={amount} currency={currency} decimals={decimals} />
      {template.slice(at + marker.length)}
    </>
  );
}

const NOTE_LINE = "text-body font-semibold text-ink";

/** One line of the price block: the text, or (while the price streams in) a skeleton bar of the same height. */
function PriceLine({ pending, width, className, children }: { pending: boolean; width: string; className: string; children?: ReactNode }) {
  if (!pending) return <p className={className}>{children}</p>;
  return (
    <div aria-hidden="true" className={className}>
      <Skeleton className={`h-[1lh] ${width}`} />
    </div>
  );
}

export type PriceBlockProps = {
  /** The quantity rule of the service: it decides which notes follow the price (`priceNotes`). */
  rule: QuantityRule;
  /** Strings: `common.quantity` and `store.service`. */
  q: CommonMessages["quantity"];
  t: StoreMessages["service"];
} & (
  | {
      /** The unit price in the shown currency and its display decimals. */
      price: { gross: string; currency: string };
      decimals: number;
      pending?: false;
    }
  | { price?: undefined; decimals?: undefined; pending: true }
);

/**
 * The price of one unit in the visitor's currency, with what a buyer needs to know when a purchase holds more than one
 * unit (BH §13, §14.3): "per unit" beside the price, "From {price × smallest quantity}" (packs, a range above 1),
 * "{N} for {price × N}" (exactly N), the packs with their estimates, and a note that the checkout shows the exact total.
 * One per order: the price alone. `pending` keeps the fixed texts (the packs title and the per-unit note) and draws only
 * the money lines as skeletons while the price streams in, so nothing moves.
 */
export function PriceBlock(props: PriceBlockProps) {
  const { rule, q, t } = props;
  const pending = props.pending === true;
  const notes = priceNotes(pending ? "0.0000" : props.price.gross, rule);
  const count = (n: number) => formatNumber(n);
  const money = (amount: string, template: string) =>
    props.pending ? null : <WithMoney template={template} amount={amount} currency={props.price.currency} decimals={props.decimals} />;
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 text-stat text-ink">
        {props.pending ? (
          <Skeleton className="h-[1lh] w-36" />
        ) : (
          <Money amount={props.price.gross} currency={props.price.currency} decimals={props.decimals} />
        )}
        {notes.perUnit && !pending ? <span className="text-small font-semibold tracking-normal text-ink-muted">{q.perUnit}</span> : null}
      </div>
      {notes.from !== null ? (
        <PriceLine pending={pending} width="w-28" className={NOTE_LINE}>
          {money(notes.from, q.from)}
        </PriceLine>
      ) : null}
      {notes.exact ? (
        <PriceLine pending={pending} width="w-32" className={NOTE_LINE}>
          {money(notes.exact.amount, fmt(q.exactFor, { count: count(notes.exact.count) }))}
        </PriceLine>
      ) : null}
      {notes.packs.length > 0 ? (
        <div className="mt-1 grid gap-1">
          <p className="text-small font-semibold text-ink-muted">{t.packsTitle}</p>
          {pending ? (
            <div aria-hidden="true" className="grid gap-0.5">
              {notes.packs.map((pack) => (
                <PriceLine key={pack.count} pending width="w-40" className="text-body" />
              ))}
            </div>
          ) : (
            <ul aria-label={t.packsTitle} className="grid gap-0.5 text-body text-ink">
              {notes.packs.map((pack) => (
                <li key={pack.count}>{money(pack.amount, fmt(q.packFor, { count: count(pack.count) }))}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {notes.perUnit ? <p className="text-small text-ink-subtle">{t.perUnitNote}</p> : null}
    </div>
  );
}
