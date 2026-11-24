// What the review page offers about paying from the store balance (plan F30, D9), as one pure function: no React, no
// cookies, no requests. The page reads who is signed in and the wallet on the server and passes the facts (an account of a
// merchant rank has no store balance: `lib/checkout/balance-context.ts`); the view draws whatever state comes back. Money is
// compared as 4-decimal strings (BigInt inside `compareMoney`), never as numbers.
import { compareMoney } from "@/lib/format";

/** The parts of `GET /store/v1/me/wallet` the choice needs. The wallet is always US dollars. */
export type BalanceWallet = {
  /** The shop switch (`wallet.customer.enabled`). */
  enabled: boolean;
  /** What can be spent now (USD, 4 decimals): `0.0000` while on hold, switched off or below zero. */
  available: string;
  /** The balance is on hold. The reason stays with staff and is never shown. */
  frozen: boolean;
};

export type BalanceOptionInput = {
  /** `session.balancePayable`: the balance is switched on and this checkout was opened by a signed-in account. */
  balancePayable: boolean;
  /** `session.amounts.usd.gross`: what the payment takes from the balance, whatever currency the checkout shows. */
  usdGross: string;
  /** An account is signed in right now (read on the server for this request). */
  signedIn: boolean;
  /** The signed-in account's store balance; null when nobody is signed in, the account has a merchant rank, or the read failed. */
  wallet: BalanceWallet | null;
};

export type BalanceOption =
  /** Nothing about the balance is shown: a guest checkout, the balance switched off, or no wallet to read. */
  | { kind: "hidden" }
  /** The checkout was opened signed in, but nobody is signed in now: offer the sign-in. */
  | { kind: "sign-in" }
  /** Signed in with the wallet on, but this checkout was opened as a guest: it cannot be paid from the balance, a new one can. */
  | { kind: "reopen" }
  /** The balance is on hold: a disabled choice. */
  | { kind: "frozen"; available: string; total: string }
  /** `available` is less than the total: the choice is disabled and Add funds is offered. */
  | { kind: "insufficient"; available: string; total: string }
  /** The balance covers the total: the choice can be picked. */
  | { kind: "ready"; available: string; total: string };

export type BalanceOptionKind = BalanceOption["kind"];

/** What the server read for one request: whether an account is signed in and its store balance (null when there is none to show). */
export type BalanceContext = { signedIn: boolean; wallet: BalanceWallet | null };

/** True when `available` covers `total`. An amount that is not a money string covers nothing (the page must not break). */
function covers(available: string, total: string): boolean {
  try {
    return compareMoney(available, total) >= 0;
  } catch {
    return false;
  }
}

/**
 * The state of the "Store balance" choice.
 *
 * - Not payable (the checkout was opened as a guest, or the balance is off): `reopen` for a signed-in account whose
 *   wallet is on, else `hidden`.
 * - Payable, nobody signed in now: `sign-in`.
 * - Payable, signed in, wallet unreadable or switched off: `hidden`.
 * - Payable, signed in: `frozen`, `insufficient` (available below the USD gross) or `ready`.
 *
 * Whether the signed-in account is the one who opened the checkout is not known here (the session does not say): the
 * payment answers `403 FORBIDDEN` for another account and the view then offers a new checkout.
 */
export function balanceOption(input: BalanceOptionInput): BalanceOption {
  const { balancePayable, usdGross, signedIn, wallet } = input;
  if (!balancePayable) return signedIn && wallet?.enabled ? { kind: "reopen" } : { kind: "hidden" };
  if (!signedIn) return { kind: "sign-in" };
  if (!wallet || !wallet.enabled) return { kind: "hidden" };
  const figures = { available: wallet.available, total: usdGross };
  if (wallet.frozen) return { kind: "frozen", ...figures };
  return covers(wallet.available, usdGross) ? { kind: "ready", ...figures } : { kind: "insufficient", ...figures };
}

/** The balance can be chosen to pay. */
export function canPayFromBalance(option: BalanceOption): option is Extract<BalanceOption, { kind: "ready" }> {
  return option.kind === "ready";
}

/** The balance shows as a choice (a radio card), enabled or not. */
export function showsBalanceChoice(option: BalanceOption): option is Extract<BalanceOption, { kind: "ready" | "frozen" | "insufficient" }> {
  return option.kind === "ready" || option.kind === "frozen" || option.kind === "insufficient";
}

/** The most sends of one balance payment while the API answers `409 IDEMPOTENCY_IN_PROGRESS` (the first one still runs). */
export const BALANCE_MAX_TRIES = 3;

/** How long to wait after `409 IDEMPOTENCY_IN_PROGRESS`: the `Retry-After` seconds, at least 1 s and at most 10 s. */
export function balanceWaitMs(retryAfterSeconds: number | undefined): number {
  const seconds = typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 1;
  return Math.min(Math.max(Math.ceil(seconds), 1), 10) * 1000;
}
