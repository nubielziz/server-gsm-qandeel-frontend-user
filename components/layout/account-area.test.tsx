// The header's account area for each visitor: the Sign in button, or the bell, the wallet pill and the one account menu.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("@/lib/api/session", () => ({ getAccount: vi.fn() }));
vi.mock("@/lib/account/wallet-read", () => ({ readAccountWallet: vi.fn() }));
vi.mock("@/components/notifications/bell-slot", () => ({
  BellSkeleton: () => null,
  BellSlot: ({ family }: { family: string }) => <span data-bell={family} />,
}));

import { readAccountWallet, type AccountWalletRead } from "@/lib/account/wallet-read";
import { accountMenuItems } from "@/lib/account/account-menu";
import { getAccount } from "@/lib/api/session";
import type { AccountMe, CustomerWallet, MerchantWallet } from "@/lib/api/types";
import { AccountAreaContent, AccountMenuRows } from "./account-area";

const account = (kind: "retail" | "merchant", over: Partial<AccountMe> = {}): AccountMe =>
  ({
    id: 7,
    name: "Dana Hart",
    email: "dana@mail.example",
    status: "active",
    rank: {
      id: kind === "merchant" ? 3 : 1,
      name: kind === "merchant" ? "Gold group" : "Retail",
      kind,
      discountPercent: "0.0000",
    },
    hasPassword: true,
    ...over,
  }) as AccountMe;

const merchantWallet = (available: string): AccountWalletRead => ({
  kind: "merchant",
  read: { ok: true, data: { balance: "10.0000", reserved: "0.0000", creditLimit: "5.0000", available } as MerchantWallet },
});
const storeWallet = (over: Partial<CustomerWallet> = {}): AccountWalletRead => ({
  kind: "store",
  read: {
    ok: true,
    data: {
      enabled: true,
      cardTopUps: true,
      currency: "USD",
      balance: "4.0000",
      reserved: "0.0000",
      creditLimit: "0.0000",
      available: "4.0000",
      frozen: null,
      ...over,
    } as CustomerWallet,
  },
});

/** The area as the visitor's page draws it, for an account and the wallet it reads. */
async function draw(me: AccountMe | null | "fails", wallet: AccountWalletRead | null, options: { compact?: boolean } = {}) {
  vi.mocked(getAccount).mockImplementation(async () => {
    if (me === "fails") throw new Error("the API is down");
    return me;
  });
  vi.mocked(readAccountWallet).mockResolvedValue(wallet);
  return renderToStaticMarkup(await AccountAreaContent(options));
}

const count = (html: string, text: string) => html.split(text).length - 1;

beforeEach(() => vi.clearAllMocks());

describe("AccountMenuRows", () => {
  it("draws the rows the menu decided, with exactly one Sign out", () => {
    const html = renderToStaticMarkup(<AccountMenuRows rows={accountMenuItems(true)} />);
    for (const href of ["/en/account", "/en/account/orders", "/en/account/wallet", "/en/account/settings"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(count(html, ">Sign out<")).toBe(1);
    expect(html).not.toContain("Merchant portal");
    expect(html).not.toContain("/merchant");
  });
});

describe("AccountAreaContent", () => {
  it("a visitor who is signed out gets the Sign in button and no menu", async () => {
    const html = await draw(null, null);
    expect(html).toContain('href="/en/sign-in"');
    expect(html).not.toContain("Account menu");
  });

  it("an account that cannot be read (the API is down) shows the Sign in button: the header never breaks the page", async () => {
    const html = await draw("fails", null);
    expect(html).toContain('href="/en/sign-in"');
  });

  it("a retail rank has the shop's bell, the store balance pill and one menu", async () => {
    const html = await draw(account("retail"), storeWallet());
    expect(html).toContain('data-bell="store"');
    expect(html).toContain("Store balance: $4.00");
    expect(html).toContain("Dana Hart");
    expect(html).toContain("dana@mail.example");
    expect(html).toContain("Retail");
    for (const href of ["/en/account", "/en/account/orders", "/en/account/wallet", "/en/account/settings"])
      expect(html).toContain(`href="${href}"`);
    expect(html).not.toContain("/en/account/services");
    expect(count(html, ">Sign out<")).toBe(1);
    expect(html).not.toContain("Merchant portal");
    expect(html).not.toContain("/merchant");
  });

  it("a retail rank whose store balance is hidden has no pill and no wallet row", async () => {
    const html = await draw(account("retail"), storeWallet({ enabled: false, balance: "0.0000", available: "0.0000" }));
    expect(html).not.toContain("Store balance");
    expect(html).not.toContain('href="/en/account/wallet"');
  });

  it("a merchant rank has the portal's bell, its available balance in the pill and the same menu, with no price list (decision 003)", async () => {
    const html = await draw(account("merchant"), merchantWallet("15.0000"));
    expect(html).toContain('data-bell="client"');
    expect(html).toContain("Available balance: $15.00");
    expect(html).toContain("Gold group");
    for (const href of ["/en/account", "/en/account/orders", "/en/account/wallet", "/en/account/settings"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).not.toContain("/en/account/services");
    expect(html).not.toContain("Price list");
    expect(count(html, ">Sign out<")).toBe(1);
    expect(html).not.toContain("Merchant portal");
    expect(html).not.toContain("/merchant");
  });

  it("the compact checkout header has the menu only: no bell, no pill, and the wallet is not read", async () => {
    const html = await draw(account("retail"), storeWallet(), { compact: true });
    expect(html).not.toContain("data-bell");
    expect(html).not.toContain("Store balance");
    expect(html).toContain("Account menu");
    expect(readAccountWallet).not.toHaveBeenCalled();
    expect(count(html, ">Sign out<")).toBe(1);
  });

  it("a wallet that cannot be read costs the pill, not the page", async () => {
    vi.mocked(getAccount).mockResolvedValue(account("merchant"));
    vi.mocked(readAccountWallet).mockRejectedValue(new Error("the API is down"));
    const html = renderToStaticMarkup(await AccountAreaContent({}));
    expect(html).not.toContain("Available balance");
    expect(html).toContain("Account menu");
    expect(html).toContain('href="/en/account/wallet"');
  });
});
