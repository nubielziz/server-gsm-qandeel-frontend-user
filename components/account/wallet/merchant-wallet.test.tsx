// The wallet page of a merchant rank: what it shows of the API's answer and where its links lead.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The retry button and the CSV button read the router; the CSV button reads the error texts from the layout's provider.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));

import { ApiError } from "@/lib/api/errors";
import type { MerchantWallet, StatementLine } from "@/lib/api/types";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { errors } from "@/lib/i18n/messages/errors";
import { MerchantWalletBody, type MerchantWalletBodyProps } from "./merchant-wallet";

const wallet: MerchantWallet = { balance: "-40.0000", reserved: "15.0000", creditLimit: "500.0000", available: "445.0000" };

const line = (over: Partial<StatementLine> = {}): StatementLine => ({
  id: 1,
  transactionId: 10,
  kind: "deposit",
  memo: "Top-up INV-2026-0042",
  amount: "100.0000",
  balanceAfter: "60.0000",
  createdAt: "2026-11-20T10:00:00.000Z",
  ...over,
});

const render = (over: Partial<MerchantWalletBodyProps> = {}) =>
  renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <MerchantWalletBody
        wallet={wallet}
        statement={{ ok: true, data: { data: [line()], total: 1 } }}
        page={1}
        searchParams={{}}
        {...over}
      />
    </ErrorTextProvider>,
  );

describe("merchant wallet page", () => {
  it("shows the four amounts as the API sends them, with the credit that is in use", () => {
    const html = render();
    for (const label of ["Available balance", "Balance", "Reserved", "Credit limit"]) expect(html, label).toContain(label);
    for (const amount of ["$445.00", "$15.00", "$500.00"]) expect(html, amount).toContain(amount);
    expect(html).toContain("-$40.00");
  });

  it("offers Add funds on the available card, at the one add-funds page of the account area", () => {
    const html = render();
    expect(html).toContain('href="/en/account/wallet/add-funds"');
    expect(html).not.toContain("/merchant/");
  });

  it("explains how online and bank payments reach the balance, and offers the statement as a CSV", () => {
    const html = render();
    expect(html).toContain("If you just paid online");
    expect(html).toContain("Download statement (CSV)");
  });

  it("lists the statement lines with their description, and names a balance transfer between wallets", () => {
    const html = render({
      statement: {
        ok: true,
        data: {
          data: [
            line(),
            line({ id: 2, kind: "wallet_transfer", memo: "Rank change", amount: "-60.0000", balanceAfter: "0.0000" }),
          ],
          total: 2,
        },
      },
    });
    expect(html).toContain("Top-up INV-2026-0042");
    expect(html).toContain("Deposit");
    expect(html).toContain("Balance transfer");
    expect(html).not.toContain("wallet_transfer");
  });

  it("says so when there is no line yet", () => {
    const html = render({ statement: { ok: true, data: { data: [], total: 0 } } });
    expect(html).toContain("No transactions yet");
  });

  it("keeps the balances when the statement could not be read, and says why with the request reference", () => {
    const html = render({
      statement: { ok: false, error: new ApiError({ status: 500, code: "INTERNAL_ERROR", requestId: "req-8841" }) },
    });
    expect(html).toContain("$445.00");
    expect(html).toContain("We could not load the statement");
    expect(html).toContain("req-8841");
  });
});
