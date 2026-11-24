// The price hint of the service page: only an account of a merchant rank sees it, with its own price and the way to order at that
// price; a visitor and a retail rank see nothing (and a retail rank costs no read of the price list).
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ account: vi.fn(), get: vi.fn() }));

vi.mock("next/cache", () => ({ navigation: async () => {} }));
vi.mock("@/lib/api/session", () => ({ getAccount: request.account }));
vi.mock("@/lib/api/server", () => ({ apiSessionGet: request.get }));
vi.mock("@/lib/api/public", () => ({ getStoreService: vi.fn() }));
vi.mock("@/lib/currency", () => ({ getCurrency: vi.fn() }));

import { ApiError } from "@/lib/api/errors";
import { RankPriceHint } from "./service-parts";

const LISTED = { id: 5, price: "3.2000", currency: "USD" };

async function render(serviceId = 5): Promise<string> {
  return renderToStaticMarkup(await RankPriceHint({ serviceId }));
}

beforeEach(() => {
  request.account.mockReset();
  request.get.mockReset();
});

describe("RankPriceHint", () => {
  it("shows a merchant rank its price, the button to order at it and the retail-only line", async () => {
    request.account.mockResolvedValue({ id: 1, rank: { id: 2, name: "Gold", kind: "merchant" } });
    request.get.mockResolvedValue(LISTED);
    const html = await render(5);
    expect(request.get).toHaveBeenCalledWith("/client/services/5");
    expect(html).toContain("Your price");
    expect(html).toContain("3.20");
    expect(html).toMatch(/<a [^>]*href="\/en\/account\/services\/5"[^>]*>Order at your price<\/a>/);
    expect(html).toContain("The shop checkout is for retail buyers.");
  });

  it("does not link to the old portal address", async () => {
    request.account.mockResolvedValue({ id: 1, rank: { kind: "merchant" } });
    request.get.mockResolvedValue(LISTED);
    expect(await render()).not.toContain("/merchant");
  });

  it("shows nothing to a visitor who is signed out", async () => {
    request.account.mockResolvedValue(null);
    expect(await render()).toBe("");
    expect(request.get).not.toHaveBeenCalled();
  });

  it("shows nothing to a retail rank and never reads the price list for it", async () => {
    request.account.mockResolvedValue({ id: 1, rank: { kind: "retail" } });
    expect(await render()).toBe("");
    expect(request.get).not.toHaveBeenCalled();
  });

  it("treats a rank kind it does not know as retail", async () => {
    request.account.mockResolvedValue({ id: 1, rank: { kind: "partner" } });
    expect(await render()).toBe("");
    expect(request.get).not.toHaveBeenCalled();
  });

  it("shows nothing, and never breaks the page, when the service is not on the account's list or the API fails", async () => {
    request.account.mockResolvedValue({ id: 1, rank: { kind: "merchant" } });
    request.get.mockRejectedValue(new ApiError({ status: 404, code: "NOT_FOUND" }));
    expect(await render()).toBe("");
    request.get.mockRejectedValue(new ApiError({ status: 500, code: "INTERNAL_ERROR" }));
    expect(await render()).toBe("");
    request.account.mockRejectedValue(new ApiError({ status: 500, code: "INTERNAL_ERROR" }));
    expect(await render()).toBe("");
  });
});
