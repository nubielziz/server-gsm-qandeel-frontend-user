// What the wallet pages decide from the API's answers, as pure functions (plan F21, D6, D7): which parts of the customer
// wallet show, how the statement's date range becomes the API's query, and how both account types' statement lines become
// one row shape for <StatementTable />. No React, no cookies: safe to import anywhere and unit-tested.
import { listQuery, pageRange, type QueryInput } from "@/lib/api/query";
import type { CustomerStatementLine, CustomerWallet, Id, StatementLine } from "@/lib/api/types";
import { dayEndIso, dayStartIso, isDateOnly } from "@/lib/merchant/lists";

// ── What the customer wallet allows ─────────────────────────────────────────────────────────────────────────────────

export type WalletCapabilities = {
  /** Whether the wallet appears at all: a nav item, a header pill. `enabled` or a balance that is not zero (D7). */
  show: boolean;
  /** "Add funds" is offered: the shop switch is on. A hold does not block it (a bank top-up works while on hold, BH §3.3). */
  canAddFunds: boolean;
  /** The balance can pay a checkout: switched on, not on hold, not negative. The amount against the total is the checkout's to compare. */
  canPay: boolean;
  /** The balance is on hold (`frozen` is set). The reason stays with staff and is never shown. */
  frozen: boolean;
  /** The balance is below zero (after a reversed card top-up). */
  negative: boolean;
};

/** -1, 0 or 1 for a money string; 0 for anything unreadable (a header must never break on a strange answer). */
function signOf(amount: string | undefined): -1 | 0 | 1 {
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec((amount ?? "").trim());
  if (!m || /^0*$/.test(m[2] + (m[3] ?? ""))) return 0;
  return m[1] ? -1 : 1;
}

/** The parts of `GET /store/v1/me/wallet` that decide what shows. */
export type WalletState = Pick<CustomerWallet, "enabled" | "balance" | "frozen">;

/**
 * `{ show, canAddFunds, canPay, frozen, negative }` of a customer wallet (D7).
 * - `enabled: false`: no Add funds, no payment from the balance; a non-zero balance and the statement still show.
 * - `enabled: false` with a zero balance: nothing shows (no nav item, no header pill).
 */
export function walletCapabilities(wallet: WalletState): WalletCapabilities {
  const enabled = wallet.enabled === true;
  const frozen = Boolean(wallet.frozen);
  const sign = signOf(wallet.balance);
  const negative = sign < 0;
  return {
    show: enabled || sign !== 0,
    canAddFunds: enabled,
    canPay: enabled && !frozen && !negative,
    frozen,
    negative,
  };
}

// ── The statement's date range and page ─────────────────────────────────────────────────────────────────────────────

/** Rows per statement page. */
export const CUSTOMER_STATEMENT_PER_PAGE = 25;

/** The range a visitor picked: `YYYY-MM-DD` dates, "" for no limit. */
export type StatementRange = { from: string; to: string };

/**
 * The range in the page's search params. A value that is not a real calendar date is dropped; a start after the end
 * drops both and sets `invalid`, so a hand-made URL never shows a misleading list.
 */
export function parseStatementRange(raw: { from?: string; to?: string }): StatementRange & { invalid: boolean } {
  const from = raw.from && isDateOnly(raw.from) ? raw.from : "";
  const to = raw.to && isDateOnly(raw.to) ? raw.to : "";
  // ISO dates sort like text.
  if (from && to && from > to) return { from: "", to: "", invalid: true };
  return { from, to, invalid: false };
}

/**
 * The query of `GET /store/v1/me/wallet/statement`: the page's rows and the range as UTC times, from the first
 * millisecond of the start day to the last one of the end day. Nothing else is sent (an unknown parameter answers 422).
 */
export function statementQuery(range: StatementRange, page: number, perPage = CUSTOMER_STATEMENT_PER_PAGE): QueryInput {
  const { start, end } = pageRange(page, perPage);
  return listQuery(
    { start, end },
    {
      createdAt_gte: range.from ? dayStartIso(range.from) : undefined,
      createdAt_lte: range.to ? dayEndIso(range.to) : undefined,
    },
  );
}

// ── One row shape for both statements ───────────────────────────────────────────────────────────────────────────────

/** A statement line as <StatementTable /> shows it. */
export type StatementRow = {
  id: Id;
  /** The ledger kind (`deposit`, `b2c_payment`, `order_hold` …): the table translates it, an unknown one is humanized. */
  kind: string;
  /** The third column's text: the merchant's description, or a customer's order label. Null shows a dash. */
  details: string | null;
  /** Signed from the account's own side. */
  amount: string;
  balanceAfter: string;
  createdAt: string;
};

/** `SF-<id>`: how an order is named on emails, receipts and the orders list. */
export function orderRef(orderId: Id): string {
  return `SF-${orderId}`;
}

/** A merchant statement: the line's `memo` is its description. */
export function merchantStatementRows(lines: StatementLine[]): StatementRow[] {
  return lines.map((line) => ({
    id: line.id,
    kind: line.kind,
    details: line.memo ? line.memo : null,
    amount: line.amount,
    balanceAfter: line.balanceAfter,
    createdAt: line.createdAt,
  }));
}

/**
 * A customer statement. The `memo` is English text and may carry a staff reason, so it is never shown (BH §3.2); a line
 * about an order says which one. `orderText` builds that sentence from the label ("Order SF-12").
 */
export function customerStatementRows(lines: CustomerStatementLine[], orderText: (ref: string) => string): StatementRow[] {
  return lines.map((line) => ({
    id: line.id,
    kind: line.kind,
    details: line.orderId ? orderText(orderRef(line.orderId)) : null,
    amount: line.amount,
    balanceAfter: line.balanceAfter,
    createdAt: line.createdAt,
  }));
}
