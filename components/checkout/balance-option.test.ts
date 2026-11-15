import { describe, expect, it } from "vitest";
import {
  BALANCE_MAX_TRIES,
  balanceOption,
  balanceWaitMs,
  canPayFromBalance,
  showsBalanceChoice,
  type BalanceOptionInput,
  type BalanceWallet,
} from "./balance-option";

const wallet = (over: Partial<BalanceWallet> = {}): BalanceWallet => ({ enabled: true, available: "20.0000", frozen: false, ...over });
const input = (over: Partial<BalanceOptionInput> = {}): BalanceOptionInput => ({
  balancePayable: true,
  usdGross: "3.9900",
  signedIn: true,
  wallet: wallet(),
  ...over,
});

describe("balanceOption: a checkout opened by a signed-in customer", () => {
  it("ready: the balance covers the total, and the figures come back as the API's strings", () => {
    expect(balanceOption(input())).toEqual({ kind: "ready", available: "20.0000", total: "3.9900" });
  });

  it("ready when the balance is exactly the total", () => {
    expect(balanceOption(input({ usdGross: "20.0000" })).kind).toBe("ready");
  });

  it("insufficient one ten-thousandth short (compared as strings, never as floats)", () => {
    expect(balanceOption(input({ usdGross: "20.0001" }))).toEqual({ kind: "insufficient", available: "20.0000", total: "20.0001" });
  });

  it("compares amounts that floats would get wrong", () => {
    // 0.1 + 0.2 style traps: 0.3000 is exactly 0.3000, not "just above".
    expect(balanceOption(input({ usdGross: "0.3000", wallet: wallet({ available: "0.3000" }) })).kind).toBe("ready");
    expect(balanceOption(input({ usdGross: "0.3001", wallet: wallet({ available: "0.3000" }) })).kind).toBe("insufficient");
  });

  it("insufficient for a zero balance and for a negative one (the API sends available 0.0000 then)", () => {
    expect(balanceOption(input({ wallet: wallet({ available: "0.0000" }) })).kind).toBe("insufficient");
    expect(balanceOption(input({ wallet: wallet({ available: "-3.0000" }) })).kind).toBe("insufficient");
  });

  it("uses the USD gross, not the amount shown in the buyer's currency", () => {
    // A checkout in EUR: the display gross is 4.44 and the USD gross 4.75. 4.50 covers the first but not the second.
    expect(balanceOption(input({ usdGross: "4.7500", wallet: wallet({ available: "4.5000" }) }))).toEqual({
      kind: "insufficient",
      available: "4.5000",
      total: "4.7500",
    });
  });

  it("frozen wins over the amount: a disabled choice even when the balance is large", () => {
    expect(balanceOption(input({ wallet: wallet({ frozen: true }) }))).toEqual({ kind: "frozen", available: "20.0000", total: "3.9900" });
    expect(balanceOption(input({ wallet: wallet({ frozen: true, available: "0.0000" }) })).kind).toBe("frozen");
  });

  it("sign-in when nobody is signed in now (the wallet is not even looked at)", () => {
    expect(balanceOption(input({ signedIn: false, wallet: null }))).toEqual({ kind: "sign-in" });
    expect(balanceOption(input({ signedIn: false, wallet: wallet() }))).toEqual({ kind: "sign-in" });
  });

  it("hidden when the wallet is switched off or could not be read", () => {
    expect(balanceOption(input({ wallet: wallet({ enabled: false }) }))).toEqual({ kind: "hidden" });
    expect(balanceOption(input({ wallet: null }))).toEqual({ kind: "hidden" });
  });

  it("an unreadable amount covers nothing and does not throw", () => {
    expect(balanceOption(input({ wallet: wallet({ available: "" }) })).kind).toBe("insufficient");
    expect(balanceOption(input({ usdGross: "n/a" })).kind).toBe("insufficient");
  });
});

describe("balanceOption: a checkout that cannot be paid from the balance", () => {
  const guest = (over: Partial<BalanceOptionInput> = {}) => input({ balancePayable: false, ...over });

  it("hidden for a guest: nobody signed in, no wallet", () => {
    expect(balanceOption(guest({ signedIn: false, wallet: null }))).toEqual({ kind: "hidden" });
  });

  it("reopen for a signed-in customer with the wallet on: the checkout was opened as a guest", () => {
    expect(balanceOption(guest())).toEqual({ kind: "reopen" });
  });

  it("reopen does not depend on the amount", () => {
    expect(balanceOption(guest({ wallet: wallet({ available: "0.0000" }) }))).toEqual({ kind: "reopen" });
  });

  it("hidden for a signed-in customer whose wallet is switched off or unreadable", () => {
    expect(balanceOption(guest({ wallet: wallet({ enabled: false, available: "0.0000" }) }))).toEqual({ kind: "hidden" });
    expect(balanceOption(guest({ wallet: null }))).toEqual({ kind: "hidden" });
  });

  it("never sign-in: a guest checkout does not ask a signed-out visitor to sign in", () => {
    expect(balanceOption(guest({ signedIn: false })).kind).not.toBe("sign-in");
  });
});

describe("the helpers the view uses", () => {
  it("only a ready option can pay", () => {
    expect(canPayFromBalance(balanceOption(input()))).toBe(true);
    expect(canPayFromBalance(balanceOption(input({ wallet: wallet({ frozen: true }) })))).toBe(false);
    expect(canPayFromBalance(balanceOption(input({ usdGross: "99.0000" })))).toBe(false);
    expect(canPayFromBalance(balanceOption(input({ signedIn: false })))).toBe(false);
  });

  it("ready, frozen and insufficient draw a choice; the others draw a note or nothing", () => {
    expect(showsBalanceChoice(balanceOption(input()))).toBe(true);
    expect(showsBalanceChoice(balanceOption(input({ wallet: wallet({ frozen: true }) })))).toBe(true);
    expect(showsBalanceChoice(balanceOption(input({ usdGross: "99.0000" })))).toBe(true);
    expect(showsBalanceChoice({ kind: "sign-in" })).toBe(false);
    expect(showsBalanceChoice({ kind: "reopen" })).toBe(false);
    expect(showsBalanceChoice({ kind: "hidden" })).toBe(false);
  });
});

describe("waiting for IDEMPOTENCY_IN_PROGRESS", () => {
  it("tries at most three times", () => {
    expect(BALANCE_MAX_TRIES).toBe(3);
  });

  it("waits Retry-After seconds, at least 1 s and at most 10 s", () => {
    expect(balanceWaitMs(undefined)).toBe(1000);
    expect(balanceWaitMs(0)).toBe(1000);
    expect(balanceWaitMs(2)).toBe(2000);
    expect(balanceWaitMs(1.2)).toBe(2000);
    expect(balanceWaitMs(600)).toBe(10_000);
    expect(balanceWaitMs(Number.NaN)).toBe(1000);
  });
});
