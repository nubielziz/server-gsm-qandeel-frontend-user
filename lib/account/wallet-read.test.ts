// The one wallet read of a request (lib/account/wallet-read.ts): which wallet route it asks for each kind of rank, and that a
// visitor who is signed out reads nothing.
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ account: vi.fn(), get: vi.fn() }));

vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: (fn: unknown) => fn }));
vi.mock("@/lib/api/session", () => ({ getAccount: request.account, signInPath: (next?: string) => next ?? "/en/sign-in" }));
vi.mock("@/lib/api/server", () => ({ apiSessionGet: request.get }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import { ApiError } from "@/lib/api/errors";
import { readAccountWallet } from "./wallet-read";

const MERCHANT_WALLET = { balance: "10.0000", reserved: "0.0000", creditLimit: "5.0000", available: "15.0000" };
const STORE_WALLET = { enabled: true, currency: "USD", balance: "4.0000", available: "4.0000", frozen: null };

function signedInAs(kind: string | undefined): void {
  request.account.mockResolvedValue({ id: 7, rank: kind === undefined ? undefined : { id: 1, name: "Rank", kind } });
}

beforeEach(() => {
  request.account.mockReset();
  request.get.mockReset();
});

describe("readAccountWallet", () => {
  it("reads nothing for a visitor who is signed out", async () => {
    request.account.mockResolvedValue(null);
    expect(await readAccountWallet()).toBeNull();
    expect(request.get).not.toHaveBeenCalled();
  });

  it("reads the portal wallet, and only it, for a merchant rank", async () => {
    signedInAs("merchant");
    request.get.mockResolvedValue(MERCHANT_WALLET);
    expect(await readAccountWallet()).toEqual({ kind: "merchant", read: { ok: true, data: MERCHANT_WALLET } });
    expect(request.get).toHaveBeenCalledTimes(1);
    expect(request.get).toHaveBeenCalledWith("/client/wallet");
  });

  it("reads the store balance, and only it, for a retail rank", async () => {
    signedInAs("retail");
    request.get.mockResolvedValue(STORE_WALLET);
    expect(await readAccountWallet()).toEqual({ kind: "store", read: { ok: true, data: STORE_WALLET } });
    expect(request.get).toHaveBeenCalledTimes(1);
    expect(request.get).toHaveBeenCalledWith("/store/v1/me/wallet");
  });

  it("reads the store balance for a rank kind it does not know (fails closed)", async () => {
    signedInAs("partner");
    request.get.mockResolvedValue(STORE_WALLET);
    expect(await readAccountWallet()).toMatchObject({ kind: "store" });
    expect(request.get).toHaveBeenCalledWith("/store/v1/me/wallet");
  });

  it("keeps a failed wallet read as a result, so a header can ignore it and a page can show it", async () => {
    signedInAs("merchant");
    const error = new ApiError({ status: 500, code: "INTERNAL_ERROR", requestId: "req-1" });
    request.get.mockRejectedValue(error);
    expect(await readAccountWallet()).toEqual({ kind: "merchant", read: { ok: false, error } });
  });

  it("throws when it cannot tell who is signed in", async () => {
    const error = new ApiError({ status: 500, code: "INTERNAL_ERROR" });
    request.account.mockRejectedValue(error);
    await expect(readAccountWallet()).rejects.toBe(error);
    expect(request.get).not.toHaveBeenCalled();
  });
});
