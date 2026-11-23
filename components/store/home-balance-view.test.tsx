import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { store } from "@/lib/i18n/messages/store";
import type { HomeBalance } from "@/lib/wallet/home-balance";
import { HomeBalanceSkeleton, HomeBalanceView } from "./home-balance-view";

const draw = (state: HomeBalance) => renderToStaticMarkup(<HomeBalanceView state={state} t={store.home.balance} />);

describe("HomeBalanceView", () => {
  it("a visitor who is not signed in gets the heading and the way to the sign-in page, and no amount", () => {
    const html = draw({ kind: "signedOut" });
    expect(html).toContain("Your balance");
    expect(html).toContain("Sign in to see your wallet balance");
    expect(html).toContain('href="/en/sign-in"');
    expect(html).not.toContain("$");
  });

  it("a customer sees the available amount, Add funds and the wallet", () => {
    const html = draw({ kind: "balance", account: "customer", available: "12.5000", canAddFunds: true });
    expect(html).toContain("12.50");
    expect(html).toContain('href="/en/account/wallet/add-funds"');
    expect(html).toContain('href="/en/account/wallet"');
  });

  it("no Add funds while the wallet is switched off", () => {
    const html = draw({ kind: "balance", account: "customer", available: "3.0000", canAddFunds: false });
    expect(html).not.toContain("add-funds");
    expect(html).toContain('href="/en/account/wallet"');
  });

  it("a merchant is led to the merchant wallet and its top-up page", () => {
    const html = draw({ kind: "balance", account: "merchant", available: "250.0000", canAddFunds: true });
    expect(html).toContain("250.00");
    expect(html).toContain('href="/en/merchant/wallet/top-up"');
    expect(html).toContain('href="/en/merchant/wallet"');
  });

  it("an account without a balance to show gets the way to its own area", () => {
    expect(draw({ kind: "noWallet", account: "customer" })).toContain('href="/en/account"');
    expect(draw({ kind: "noWallet", account: "merchant" })).toContain('href="/en/merchant"');
  });

  it("the skeleton keeps the heading while the session is read", () => {
    expect(renderToStaticMarkup(<HomeBalanceSkeleton />)).toContain("Your balance");
  });
});
