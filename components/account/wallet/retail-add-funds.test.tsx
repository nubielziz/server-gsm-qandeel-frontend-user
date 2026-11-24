// The Add funds page of a retail rank: what shows for each answer of the API.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The forms and the retry button read the router; the forms read the error texts from the layout's provider.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
vi.mock("@/lib/payment-logo-sizes.json", () => ({ default: {} }));

import { ApiError } from "@/lib/api/errors";
import type { CustomerWallet, TopUpMethod } from "@/lib/api/types";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { errors } from "@/lib/i18n/messages/errors";
import { RetailAddFundsBody } from "./retail-add-funds";

const wrap = (node: React.ReactElement) => renderToStaticMarkup(<ErrorTextProvider messages={errors}>{node}</ErrorTextProvider>);

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

const storeMethod = (id: number, over: Partial<TopUpMethod> = {}): TopUpMethod =>
  ({
    id,
    code: `method-${id}`,
    name: `Method ${id}`,
    kind: "manual",
    methodType: "bank",
    feePercent: "0",
    feeFixed: "0.0000",
    minAmount: "0.0000",
    maxAmount: "0.0000",
    holdHours: 0,
    preset: null,
    logoUrl: null,
    ...over,
  }) as TopUpMethod;

describe("Add funds of a retail rank", () => {
  const ok = (methods: TopUpMethod[]) => ({ ok: true as const, data: methods });

  it("shows the form with a radio per method and its limits", () => {
    const html = wrap(
      <RetailAddFundsBody wallet={storeWallet()} methods={ok([storeMethod(1), storeMethod(2, { kind: "automatic" })])} />,
    );
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain("Your limits");
  });

  it("explains a switched-off store balance and leads back to the wallet", () => {
    const html = wrap(<RetailAddFundsBody wallet={storeWallet({ enabled: false })} methods={ok([])} />);
    expect(html).toContain("Adding funds is paused");
    expect(html).toContain('href="/en/account/wallet"');
    expect(html).not.toContain('type="radio"');
  });

  it("says when no method is offered, with a way to ask support", () => {
    const html = wrap(<RetailAddFundsBody wallet={storeWallet()} methods={ok([])} />);
    expect(html).toContain("No payment methods are available");
    expect(html).toContain('href="/en/support"');
  });

  it("warns that a balance on hold takes no online payment", () => {
    const html = wrap(
      <RetailAddFundsBody
        wallet={storeWallet({ frozen: { at: "2026-11-01T12:00:00.000Z" } })}
        methods={ok([storeMethod(1), storeMethod(2, { kind: "automatic" })])}
      />,
    );
    expect(html).toContain("Your balance is on hold");
    expect(html).toContain("Not available while your balance is on hold");
  });

  it("warns when today's limit or the room in the wallet is used up", () => {
    const limits = storeWallet().limits;
    expect(
      wrap(
        <RetailAddFundsBody wallet={storeWallet({ limits: { ...limits, topUpsLeftToday: 0 } })} methods={ok([storeMethod(1)])} />,
      ),
    ).toContain("You have reached today");
    expect(
      wrap(<RetailAddFundsBody wallet={storeWallet({ limits: { ...limits, room: "0.0000" } })} methods={ok([storeMethod(1)])} />),
    ).toContain("Your balance is at its limit");
  });

  it("says why the methods could not be read, with the request reference", () => {
    const methods = { ok: false as const, error: new ApiError({ status: 500, code: "INTERNAL_ERROR", requestId: "req-5521" }) };
    const html = wrap(<RetailAddFundsBody wallet={storeWallet()} methods={methods} />);
    expect(html).toContain("We could not load the payment methods");
    expect(html).toContain("req-5521");
  });
});
