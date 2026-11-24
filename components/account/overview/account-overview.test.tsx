// The overview of every account (components/account/overview/account-overview.tsx): which body each kind of rank gets, and
// which API routes each body reads. A retail account never reads the portal dashboard and a merchant rank never reads the
// shop's list of orders.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ account: vi.fn(), get: vi.fn(), list: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: async () => ({ has: () => false }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect to ${to}`);
  },
  notFound: () => {
    throw new Error("not found");
  },
  useRouter: () => ({ refresh: () => {} }),
}));
vi.mock("@/lib/api/session", () => ({
  requireAccount: request.account,
  signInPath: (next?: string) => `/en/sign-in?next=${next ?? ""}`,
}));
vi.mock("@/lib/api/server", () => ({ apiSessionGet: request.get, apiSessionList: request.list }));

import { ApiError } from "@/lib/api/errors";
import type { AccountMe, CustomerOrder, MerchantDashboard } from "@/lib/api/types";
import { AccountOverview } from "./account-overview";
import { MerchantOverview } from "./merchant-overview";
import { RetailOverview } from "./retail-overview";

const account = (kind: string, over: Partial<AccountMe> = {}): AccountMe =>
  ({
    id: 5,
    name: "Daniel Whitmore",
    email: "d@example.test",
    status: "active",
    rank: { id: 1, name: kind === "merchant" ? "Gold merchant" : "Retail", kind, discountPercent: "0.0000" },
    hasPassword: true,
    mustChangePassword: false,
    twofaEnabled: false,
    currency: "EUR",
    marketingOptIn: true,
    company: "",
    username: "",
    phone: "+962 7 9000 0000",
    country: "JO",
    address: "",
    taxId: "",
    emailVerifiedAt: "2026-02-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  }) as AccountMe;

const retailOrder = (id: number, trackingToken: string | null): CustomerOrder => ({
  id,
  status: "completed",
  service: { id: 3, name: "Carrier check" },
  imei: "490154203237518",
  quantity: 1,
  totalPrice: "5.0000",
  taxAmount: "0.0000",
  currency: "USD",
  trackingToken,
  createdAt: "2026-11-01T10:00:00.000Z",
  completedAt: null,
});

const dashboard: MerchantDashboard = {
  wallet: { balance: "10.0000", reserved: "2.0000", creditLimit: "5.0000", available: "13.0000" },
  counts: { pending: 1, processing: 2, completed: 3, rejected: 4 },
  openOrders: 3,
  latestOrders: [],
};

beforeEach(() => {
  request.account.mockReset();
  request.get.mockReset();
  request.list.mockReset();
});

describe("AccountOverview (which body)", () => {
  it("asks for the account with the overview as the place to come back to", async () => {
    request.account.mockResolvedValue(account("retail"));
    await AccountOverview();
    expect(request.account).toHaveBeenCalledWith("/en/account");
  });

  it("gives a merchant rank the dashboard", async () => {
    request.account.mockResolvedValue(account("merchant"));
    expect((await AccountOverview()).type).toBe(MerchantOverview);
  });

  it("gives a retail rank the retail overview", async () => {
    request.account.mockResolvedValue(account("retail"));
    expect((await AccountOverview()).type).toBe(RetailOverview);
  });

  it("gives a rank kind it does not know the retail overview (fails closed)", async () => {
    request.account.mockResolvedValue(account("partner"));
    expect((await AccountOverview()).type).toBe(RetailOverview);
  });
});

describe("RetailOverview", () => {
  it("reads the five latest orders of the shop and never the portal dashboard", async () => {
    request.list.mockResolvedValue({ data: [retailOrder(12, "t_abc123")], total: 9 });
    const html = renderToStaticMarkup(await RetailOverview({ me: account("retail") }));
    expect(request.list).toHaveBeenCalledTimes(1);
    expect(request.list.mock.calls[0][0]).toBe("/store/v1/me/orders");
    expect(request.list.mock.calls[0][1].query).toMatchObject({ _start: 0, _end: 5 });
    expect(request.get).not.toHaveBeenCalled();
    expect(html).toContain('href="/en/track/t_abc123"');
    expect(html).toContain("9 in total");
  });

  it("greets by name with the rank beside it, and shows the profile and the preferences", async () => {
    request.list.mockResolvedValue({ data: [], total: 0 });
    const html = renderToStaticMarkup(await RetailOverview({ me: account("retail") }));
    expect(html).toContain("Welcome back, Daniel Whitmore");
    expect(html).toContain("Retail");
    expect(html).toContain("d@example.test");
    expect(html).toContain("Verified");
    expect(html).toContain("EUR");
    expect(html).toContain("No orders yet");
    expect(html).toContain('href="/en/account/settings#profile"');
  });

  it("keeps the profile and shows the failure in the place of the list when the orders cannot be read", async () => {
    request.list.mockRejectedValue(new ApiError({ status: 500, code: "INTERNAL_ERROR", requestId: "req-7" }));
    const html = renderToStaticMarkup(await RetailOverview({ me: account("retail") }));
    expect(html).toContain("req-7");
    expect(html).toContain("d@example.test");
  });

  it("signs a visitor out of the page when the orders answer 401", async () => {
    request.list.mockRejectedValue(new ApiError({ status: 401, code: "UNAUTHORIZED" }));
    await expect(RetailOverview({ me: account("retail") }).then((element) => renderToStaticMarkup(element))).rejects.toThrow(
      "redirect to /en/sign-in",
    );
  });
});

describe("MerchantOverview", () => {
  it("reads the portal dashboard and never the shop's list of orders", async () => {
    request.get.mockResolvedValue(dashboard);
    const html = renderToStaticMarkup(await MerchantOverview({ me: account("merchant") }));
    expect(request.get).toHaveBeenCalledTimes(1);
    expect(request.get.mock.calls[0][0]).toBe("/client/dashboard");
    expect(request.list).not.toHaveBeenCalled();
    expect(html).toContain("$13.00");
    expect(html).toContain('href="/en/account/wallet/add-funds"');
  });

  it("greets by name with the rank beside it and offers a new order in the shop (decision 003)", async () => {
    request.get.mockResolvedValue(dashboard);
    const html = renderToStaticMarkup(await MerchantOverview({ me: account("merchant") }));
    expect(html).toContain("Welcome back, Daniel Whitmore");
    expect(html).toContain("Gold merchant");
    expect(html).toContain('href="/en/services"');
    expect(html).not.toContain("/en/account/services");
  });

  it("keeps the greeting and shows the failure when the dashboard cannot be read", async () => {
    request.get.mockRejectedValue(new ApiError({ status: 500, code: "INTERNAL_ERROR", requestId: "req-8" }));
    const html = renderToStaticMarkup(await MerchantOverview({ me: account("merchant") }));
    expect(html).toContain("Welcome back, Daniel Whitmore");
    expect(html).toContain("req-8");
  });

  it("shows the failure in place, without a redirect loop, when the rank is refused on the account home", async () => {
    request.get.mockRejectedValue(new ApiError({ status: 403, code: "RANK_NOT_ALLOWED", requestId: "req-9" }));
    const html = renderToStaticMarkup(await MerchantOverview({ me: account("merchant") }));
    expect(html).toContain("req-9");
  });
});
