// The wallet page of a retail rank (the store balance): which parts show for each state of the wallet.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The retry button and the return notice read the router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));

import { ApiError } from "@/lib/api/errors";
import type { CustomerStatementLine, CustomerWallet, TopUp } from "@/lib/api/types";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { errors } from "@/lib/i18n/messages/errors";
import { RetailWalletBody, type RetailWalletBodyProps } from "./retail-wallet";

const storeWallet = (over: Partial<CustomerWallet> = {}): CustomerWallet =>
  ({
    enabled: true,
    cardTopUps: true,
    currency: "USD",
    balance: "20.0000",
    reserved: "0.0000",
    creditLimit: "0.0000",
    available: "20.0000",
    frozen: null,
    pendingTopUps: { count: 0, amount: "0.0000" },
    limits: {
      minTopUp: "5.0000",
      maxTopUp: "500.0000",
      maxBalance: "1000.0000",
      room: "980.0000",
      topUpsLeftToday: 5,
      amountLeftToday: "1000.0000",
    },
    ...over,
  }) as CustomerWallet;

const line = (over: Partial<CustomerStatementLine> = {}): CustomerStatementLine => ({
  id: 1,
  transactionId: 10,
  kind: "adjustment",
  memo: "Secret staff reason 4821",
  orderId: null,
  amount: "20.0000",
  balanceAfter: "20.0000",
  createdAt: "2026-11-20T10:00:00.000Z",
  ...over,
});

const topUp = (id: number): TopUp =>
  ({
    id,
    number: `INV-2026-${String(id).padStart(4, "0")}`,
    status: "awaiting_payment",
    amount: "25.0000",
    fee: "0.0000",
    netAmount: "25.0000",
    currency: "USD",
    method: { id: 1, code: "bank", name: "Bank", kind: "manual", methodType: "bank" },
    createdAt: "2026-11-20T10:00:00.000Z",
  }) as unknown as TopUp;

const render = (over: Partial<RetailWalletBodyProps> = {}) =>
  renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <RetailWalletBody
        wallet={storeWallet()}
        currency={null}
        statement={{ ok: true, data: { data: [line()], total: 1 } }}
        latestTopUps={{ ok: true, data: { data: [], total: 0 } }}
        range={{ from: "", to: "", invalid: false }}
        page={1}
        returnedTopUp={null}
        {...over}
      />
    </ErrorTextProvider>,
  );

describe("retail wallet page", () => {
  it("shows the two amounts and Add funds at the one add-funds page of the account area", () => {
    const html = render();
    expect(html).toContain("Available balance");
    expect(html).toContain("$20.00");
    expect(html).toContain('href="/en/account/wallet/add-funds"');
    expect(html).not.toContain("Reserved");
    expect(html).not.toContain("Credit limit");
  });

  it("names a statement line by its kind and never prints the staff memo", () => {
    const html = render();
    expect(html).toContain("Adjustment");
    expect(html).not.toContain("Secret staff reason");
  });

  it("names a balance transfer between wallets without showing its memo", () => {
    const html = render({
      statement: { ok: true, data: { data: [line({ kind: "wallet_transfer", memo: "Rank change" })], total: 1 } },
    });
    expect(html).toContain("Balance transfer");
    expect(html).not.toContain("Rank change");
  });

  it("shows the hold, with its date and without the reason, and no spendable amount", () => {
    const html = render({ wallet: storeWallet({ frozen: { at: "2026-11-01T12:00:00.000Z" }, available: "0.0000" }) });
    expect(html).toContain("Your balance is on hold");
    expect(html).toContain("Nov 1, 2026");
    expect(html).toContain("$0.00");
  });

  it("says when the balance is below zero", () => {
    expect(render({ wallet: storeWallet({ balance: "-3.0000", available: "0.0000" }) })).toContain("Your balance is below zero");
  });

  it("offers nothing to add while the store balance is paused, but keeps the balance and the statement", () => {
    const html = render({ wallet: storeWallet({ enabled: false, available: "0.0000" }) });
    expect(html).toContain("The store balance is paused");
    expect(html).not.toContain("/account/wallet/add-funds");
    expect(html).toContain("Adjustment");
  });

  it("shows only a way back when the store balance is paused and empty", () => {
    const html = render({ wallet: storeWallet({ enabled: false, balance: "0.0000", available: "0.0000" }) });
    expect(html).toContain("Back to my account");
    expect(html).not.toContain("Statement");
  });

  it("lists the latest top-ups, each linked to its own page", () => {
    const html = render({ latestTopUps: { ok: true, data: { data: [topUp(42)], total: 1 } } });
    expect(html).toContain("INV-2026-0042");
    expect(html).toContain('href="/en/account/wallet/top-ups/42"');
  });

  it("follows the top-up an online payment returned from, and ignores no other", () => {
    expect(render({ returnedTopUp: "42" })).toContain("/en/account/wallet/top-ups/42");
    expect(render({ returnedTopUp: null })).not.toContain("/en/account/wallet/top-ups/42");
  });

  it("keeps the balance when the statement could not be read, and says why with the request reference", () => {
    const html = render({
      statement: { ok: false, error: new ApiError({ status: 500, code: "INTERNAL_ERROR", requestId: "req-7310" }) },
    });
    expect(html).toContain("$20.00");
    expect(html).toContain("We could not load the statement");
    expect(html).toContain("req-7310");
  });
});
