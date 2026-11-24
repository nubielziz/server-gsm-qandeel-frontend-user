// The review-and-pay page (`/checkout/<token>`): which store balance it tells the view about. A retail account's wallet is read and
// handed over; an account of a merchant rank has no store balance, so its wallet is not even read; a visitor who is signed out is
// told so. The reads are replaced; the page's own code runs and its tree is read without rendering the components in it.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ account: vi.fn(), wallet: vi.fn(), session: vi.fn() }));

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {}, replace() {} }) }));
vi.mock("@/lib/api/session", () => ({ getAccount: reads.account }));
vi.mock("@/lib/account/wallet-read", () => ({ readAccountWallet: reads.wallet }));
vi.mock("@/lib/api/server", () => ({ apiSessionGet: reads.session }));
vi.mock("@/lib/api/public", () => ({ getStoreConfig: async () => ({ currencies: [{ code: "USD", decimals: 2 }] }) }));
vi.mock("@/lib/catalog", () => ({ slugForService: async () => "icloud-clean" }));

import CheckoutSessionPage from "@/app/en/(checkout)/checkout/[token]/page";
import { SessionView } from "./session-view";

type Element = ReactElement<Record<string, unknown>>;

const SESSION = {
  token: "tok-1",
  status: "open",
  currency: "USD",
  country: "DE",
  service: { id: 42, name: "iCloud Clean", type: "imei" },
  quantity: 1,
  balancePayable: true,
  amounts: { usd: { gross: "4.7500" } },
};

const RETAIL = { id: 1, rank: { id: 1, name: "Retail", kind: "retail" } };
const MERCHANT = { id: 2, rank: { id: 2, name: "Gold", kind: "merchant" } };
const STORE_READ = {
  kind: "store",
  read: { ok: true, data: { enabled: true, currency: "USD", balance: "20.0000", available: "20.0000", frozen: null } },
};

beforeEach(() => {
  reads.account.mockReset();
  reads.wallet.mockReset().mockResolvedValue(STORE_READ);
  reads.session.mockReset().mockResolvedValue(SESSION);
});

function find(node: ReactNode, match: (element: Element) => boolean): Element | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, match);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement<Record<string, unknown>>(node)) return null;
  if (match(node)) return node;
  for (const value of Object.values(node.props)) {
    const found = find(value as ReactNode, match);
    if (found) return found;
  }
  return null;
}

/** What the page tells the view about the balance. */
async function balanceShown(): Promise<unknown> {
  const page = CheckoutSessionPage({ params: Promise.resolve({ token: "tok-1" }) } as never);
  const inner = find(page, (element) => typeof element.type === "function" && element.type.name === "Session");
  const tree = await (inner!.type as (props: unknown) => Promise<ReactNode>)(inner!.props);
  const view = find(tree, (element) => element.type === SessionView);
  return view!.props.balance;
}

describe("the review page's store balance", () => {
  it("hands a retail account its wallet", async () => {
    reads.account.mockResolvedValue(RETAIL);
    expect(await balanceShown()).toEqual({ signedIn: true, wallet: { enabled: true, available: "20.0000", frozen: false } });
    expect(reads.wallet).toHaveBeenCalledTimes(1);
  });

  it("gives a merchant rank no store balance and does not read a wallet for it", async () => {
    reads.account.mockResolvedValue(MERCHANT);
    expect(await balanceShown()).toEqual({ signedIn: true, wallet: null });
    expect(reads.wallet).not.toHaveBeenCalled();
  });

  it("tells the view nobody is signed in for a visitor, and reads no wallet", async () => {
    reads.account.mockResolvedValue(null);
    expect(await balanceShown()).toEqual({ signedIn: false, wallet: null });
    expect(reads.wallet).not.toHaveBeenCalled();
  });

  it("leaves the balance out, and stays signed in, when the account or its wallet cannot be read", async () => {
    reads.account.mockRejectedValue(new Error("down"));
    expect(await balanceShown()).toEqual({ signedIn: true, wallet: null });
    reads.account.mockResolvedValue(RETAIL);
    reads.wallet.mockResolvedValue({ kind: "store", read: { ok: false, error: new Error("down") } });
    expect(await balanceShown()).toEqual({ signedIn: true, wallet: null });
    reads.wallet.mockRejectedValue(new Error("down"));
    expect(await balanceShown()).toEqual({ signedIn: true, wallet: null });
  });

  it("reads nobody for a checkout that is no longer open", async () => {
    reads.session.mockResolvedValue({ ...SESSION, status: "paid" });
    reads.account.mockResolvedValue(RETAIL);
    expect(await balanceShown()).toEqual({ signedIn: false, wallet: null });
    expect(reads.account).not.toHaveBeenCalled();
  });
});
