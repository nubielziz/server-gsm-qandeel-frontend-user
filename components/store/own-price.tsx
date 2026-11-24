"use client";
// The personal price layer in the browser (decision 003). The shop draws every price of a service on the server, cached and
// shared, at the public price; each of those places wraps it in a slot from this file. A slot shows what the server drew to
// a guest and to a retail account (nothing is read, nothing waits, no placeholder ever shows), and to an account of a merchant
// rank its own price in the same place: a neutral placeholder until the price is there, "Not available for your account"
// (with the buy action off) for a service it may not buy. The state, the reads and the rules are lib/store/own-prices.ts; the
// own prices never reach the server's caches or lib/api/public.ts. `OwnPricesLayer` is mounted once in the shop layout and
// gives the slots their words; a slot outside it (the header of the 404 page) uses the English defaults below.
import { createContext, use, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Money } from "@/components/ui/money";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { api } from "@/lib/api/browser";
import type { AccountMe, MerchantService } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import type { CommonMessages } from "@/lib/i18n/messages/common";
import type { StoreMessages } from "@/lib/i18n/messages/store";
import type { QuantityRule } from "@/lib/quantity";
import {
  EARLY,
  OwnPriceStore,
  RETAIL_PRICE_ATTRIBUTE,
  isNotMerchantAnswer,
  liftOwnPricesGuard,
  type OwnPriceState,
  type OwnPriceVisitor,
} from "@/lib/store/own-prices";
import { PriceBlock } from "./price-block";

/** What the slots say (`store.ownPrice`). */
export type OwnPriceLabels = {
  /** Read to screen readers while the account's own price loads. */
  loading: string;
  /** In place of the price of a service the account may not buy. */
  unavailable: string;
  /** Read to screen readers when the account's price could not be read. */
  failed: string;
};

const defaults: OwnPriceLabels = {
  loading: "Loading your price",
  unavailable: "Not available for your account",
  failed: "Your price could not be loaded",
};

const LabelsContext = createContext<OwnPriceLabels>(defaults);

/** The layer: mounted once in the shop layout, it gives every slot below it its words. It reads nothing itself. */
export function OwnPricesLayer({ labels, children }: { labels: OwnPriceLabels; children: ReactNode }) {
  return <LabelsContext value={labels}>{children}</LabelsContext>;
}

let shared: OwnPriceStore | null = null;

/** The one store of the tab, reading through the browser client (`no-store`, the session's own cookies). */
function ownPriceStore(): OwnPriceStore {
  shared ??= new OwnPriceStore({
    cookies: () => (typeof document === "undefined" ? "" : document.cookie),
    me: () =>
      api.get<AccountMe>(FAMILY_ROUTES.client.me).catch((error: unknown) => {
        // Signed out, or a rank the portal routes refuse: not a merchant. Anything else: the layer cannot tell.
        if (isNotMerchantAnswer(error)) return null;
        throw error;
      }),
    // A leftover cookie of an ended session: the public prices show again and nothing stays hidden.
    notMerchant: () => liftOwnPricesGuard(document.documentElement),
    prices: (query) => api.list<MerchantService>(FAMILY_ROUTES.client.services, { query }).then((page) => page.data),
  });
  return shared;
}

const serverPrice = (): OwnPriceState => EARLY;
const serverVisitor = (): OwnPriceVisitor => "early";

/** What the slot of one service shows now; asks for the service's own price while the slot is on the page. */
export function useOwnPrice(serviceId: number): OwnPriceState {
  const store = ownPriceStore();
  const state = useSyncExternalStore(store.subscribe, () => store.price(serviceId), serverPrice);
  useEffect(() => store.want(serviceId), [store, serviceId]);
  return state;
}

/** Who the page's prices are for (`OwnPriceVisitor`). */
export function useOwnPriceVisitor(): OwnPriceVisitor {
  const store = ownPriceStore();
  const visitor = useSyncExternalStore(store.subscribe, store.visitor, serverVisitor);
  useEffect(() => store.want(), [store]);
  return visitor;
}

/** The marker of a public price the server drew, while the page is not live yet (`early`). */
const marker = (state: OwnPriceState | OwnPriceVisitor) =>
  state === EARLY || state === "early" ? { [RETAIL_PRICE_ATTRIBUTE]: "" } : undefined;

const NOTE = "min-w-0 text-small font-medium text-ink-muted";

export type OwnPriceViewProps = {
  state: OwnPriceState;
  labels: OwnPriceLabels;
  /** The classes of the price (size, weight, colour, layout): the own price and the placeholder take them too. */
  className?: string;
  /** The placeholder's width (`w-16` by default); it takes the line height of `className`. */
  placeholderClassName?: string;
  /** The public price as the server drew it. */
  children: ReactNode;
};

/** One price in a line (a card, a row of a list, a search suggestion), drawn for `state`. No reads. */
export function OwnPriceView({ state, labels, className, placeholderClassName, children }: OwnPriceViewProps) {
  let shown: ReactNode = children;
  if (state.kind === "pending") {
    shown = (
      <span className={cn("inline-block", className)}>
        <span aria-hidden="true" className={cn("skeleton inline-block h-[1lh] align-top", placeholderClassName ?? "w-16")} />
        <span className="sr-only">{labels.loading}</span>
      </span>
    );
  } else if (state.kind === "own") {
    shown = <Money amount={state.price} currency={state.currency} className={className} />;
  } else if (state.kind === "unavailable") {
    shown = <span className={NOTE}>{labels.unavailable}</span>;
  } else if (state.kind === "failed") {
    shown = (
      <span className={className}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{labels.failed}</span>
      </span>
    );
  }
  return (
    <span className="contents" {...marker(state)}>
      {shown}
    </span>
  );
}

/** One price in a line: the public price (`children`) for a guest and a retail account, the account's own for a merchant rank. */
export function OwnPrice({ serviceId, ...props }: Omit<OwnPriceViewProps, "state" | "labels"> & { serviceId: number }) {
  return <OwnPriceView state={useOwnPrice(serviceId)} labels={use(LabelsContext)} {...props} />;
}

export type OwnPriceBlockViewProps = {
  state: OwnPriceState;
  labels: OwnPriceLabels;
  /** The quantity rule of the service (the notes under the price). */
  rule: QuantityRule;
  q: CommonMessages["quantity"];
  t: StoreMessages["service"];
  /** The public price block and its tax line, as the server drew them. */
  children: ReactNode;
};

/**
 * The price block of the service page and the quick view, drawn for `state`: the account's own price with the same notes ("per
 * unit", "From", the packs) in the currency of its wallet and without the tax line, as its order form shows it. No reads.
 */
export function OwnPriceBlockView({ state, labels, rule, q, t, children }: OwnPriceBlockViewProps) {
  let shown: ReactNode = children;
  if (state.kind === "pending") {
    shown = (
      <div className="mt-1">
        <PriceBlock pending rule={rule} q={q} t={t} />
        <p className="sr-only">{labels.loading}</p>
      </div>
    );
  } else if (state.kind === "own") {
    shown = (
      <div className="mt-1">
        <PriceBlock price={{ gross: state.price, currency: state.currency }} decimals={2} rule={rule} q={q} t={t} />
      </div>
    );
  } else if (state.kind === "unavailable") {
    shown = <p className="mt-1 text-body font-semibold text-ink-muted">{labels.unavailable}</p>;
  } else if (state.kind === "failed") {
    shown = (
      <p className="mt-1 text-stat text-ink-muted">
        <span aria-hidden="true">—</span>
        <span className="sr-only">{labels.failed}</span>
      </p>
    );
  }
  return (
    <div className="contents" {...marker(state)}>
      {shown}
    </div>
  );
}

/** The price block of the service page and the quick view (`children`: the public one with its tax line). */
export function OwnPriceBlock({ serviceId, ...props }: Omit<OwnPriceBlockViewProps, "state" | "labels"> & { serviceId: number }) {
  return <OwnPriceBlockView state={useOwnPrice(serviceId)} labels={use(LabelsContext)} {...props} />;
}

export type OwnBuyViewProps = {
  state: OwnPriceState;
  /** What a merchant rank gets instead of `children` (the order link of a file service, which the shop checkout does not sell). */
  merchant?: ReactNode;
  /** `div` where the action is a block (an alert); `span` (default) for a button or a link. */
  as?: "span" | "div";
  /** The buy action everybody else gets. */
  children: ReactNode;
};

/**
 * A buy action (a card's order link, "Buy now"), drawn for `state`: off (dimmed, out of reach of the pointer, the keyboard and
 * assistive technology) for a service the account may not buy, whose price slot says so. No reads.
 */
export function OwnBuyView({ state, merchant, as: Tag = "span", children }: OwnBuyViewProps) {
  const personal = state.kind === "pending" || state.kind === "own" || state.kind === "unavailable" || state.kind === "failed";
  const shown = personal && merchant !== undefined ? merchant : children;
  if (state.kind === "unavailable") {
    return (
      <Tag inert className="contents [&>*]:pointer-events-none [&>*]:opacity-50">
        {shown}
      </Tag>
    );
  }
  return <Tag className="contents">{shown}</Tag>;
}

/** A buy action that is off for a service the account may not buy (see `OwnBuyView`). */
export function OwnBuy({ serviceId, ...props }: Omit<OwnBuyViewProps, "state"> & { serviceId: number }) {
  return <OwnBuyView state={useOwnPrice(serviceId)} {...props} />;
}

export type RetailOnlyViewProps = {
  visitor: OwnPriceVisitor;
  /** What an account of a merchant rank sees instead (nothing by default; a same-size space where a line must keep its height). */
  fallback?: ReactNode;
  as?: "span" | "div";
  /** A price that sums up many services at their public prices ("Starting from", a collection's "From"). */
  children: ReactNode;
};

/**
 * A price that sums up many services (the lowest of the catalog, the lowest of a collection), drawn for `visitor`: it is a
 * public price, and the account's own lowest price would need the whole catalog read, so a merchant rank does not see it. No reads.
 */
export function RetailOnlyView({ visitor, fallback = null, as: Tag = "span", children }: RetailOnlyViewProps) {
  if (visitor === "personal") return <Tag className="contents">{fallback}</Tag>;
  return (
    <Tag className="contents" {...marker(visitor)}>
      {children}
    </Tag>
  );
}

/** A public price that sums up many services: shown to a guest and a retail account only (see `RetailOnlyView`). */
export function RetailOnly(props: Omit<RetailOnlyViewProps, "visitor">) {
  return <RetailOnlyView visitor={useOwnPriceVisitor()} {...props} />;
}
