// The header wallet pill (components/layout/wallet-pill.tsx): who sees it, what it says and where it goes.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/account/wallet-read", () => ({ readAccountWallet: vi.fn() }));

import type { AccountWalletRead } from "@/lib/account/wallet-read";
import type { CustomerWallet, MerchantWallet } from "@/lib/api/types";
import { WalletPillLink, walletPillOf } from "./wallet-pill";

const merchantWallet = (available: string): MerchantWallet => ({
  balance: "10.0000",
  reserved: "0.0000",
  creditLimit: "5.0000",
  available,
});
const storeWallet = (over: Partial<CustomerWallet>): CustomerWallet =>
  ({
    enabled: true,
    cardTopUps: true,
    currency: "USD",
    balance: "4.0000",
    reserved: "0.0000",
    creditLimit: "0.0000",
    available: "4.0000",
    frozen: null,
    ...over,
  }) as CustomerWallet;

const merchant = (available = "15.0000"): AccountWalletRead => ({
  kind: "merchant",
  read: { ok: true, data: merchantWallet(available) },
});
const store = (over: Partial<CustomerWallet> = {}): AccountWalletRead => ({
  kind: "store",
  read: { ok: true, data: storeWallet(over) },
});

describe("walletPillOf", () => {
  it("shows nothing for a visitor who is signed out", () => {
    expect(walletPillOf(null)).toBeNull();
  });

  it("shows a merchant rank's available amount, which already counts the credit, and goes to the one wallet page", () => {
    expect(walletPillOf(merchant("15.0000"))).toEqual({
      href: "/en/account/wallet",
      label: "Available balance",
      amount: "15.0000",
    });
    expect(walletPillOf(merchant("0.0000"))?.amount).toBe("0.0000");
  });

  it("shows a retail rank's store balance while the shop switch is on", () => {
    expect(walletPillOf(store({ enabled: true, balance: "0.0000", available: "0.0000" }))).toEqual({
      href: "/en/account/wallet",
      label: "Store balance",
      amount: "0.0000",
    });
  });

  it("shows a switched-off store balance only while a balance is left", () => {
    expect(walletPillOf(store({ enabled: false, balance: "0.0000", available: "0.0000" }))).toBeNull();
    expect(walletPillOf(store({ enabled: false, balance: "3.0000", available: "0.0000" }))).toMatchObject({ amount: "0.0000" });
  });

  it("shows nothing when the wallet could not be read, for either kind", () => {
    expect(walletPillOf({ kind: "merchant", read: { ok: false, error: new Error("x") } })).toBeNull();
    expect(walletPillOf({ kind: "store", read: { ok: false, error: new Error("x") } })).toBeNull();
  });
});

describe("WalletPillLink", () => {
  const pill = { href: "/en/account/wallet", label: "Store balance", amount: "12.5000" };

  it("is a link to the wallet page with the amount and a label for screen readers", () => {
    const html = renderToStaticMarkup(<WalletPillLink pill={pill} />);
    expect(html).toContain('href="/en/account/wallet"');
    expect(html).toContain('aria-label="Store balance: $12.50"');
    expect(html).toContain("$12.50");
  });

  it("steps aside on phones in both places it is used", () => {
    expect(renderToStaticMarkup(<WalletPillLink pill={pill} variant="frame" />)).toContain("max-sm:hidden");
    expect(renderToStaticMarkup(<WalletPillLink pill={pill} variant="header" />)).toMatch(
      /class="[^"]*\bhidden\b[^"]*sm:inline-flex/,
    );
  });
});
