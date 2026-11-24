// The two pages of the price list (app/en/account/services): they belong to the merchant rank, so each one asks for that
// rank before it reads anything, and every address they draw or hand to the order form is a page of the account area. The
// session reader, the API reads and the wallet read are stand-ins; the pages' own code runs.
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantService, MerchantServiceDetail } from "@/lib/api/types";

const stub = vi.hoisted(() => ({
  requireRank: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  wallet: vi.fn(),
}));

vi.mock("@/lib/api/session", () => ({
  requireRank: stub.requireRank,
  signInPath: (next?: string) => (next ? `/en/sign-in?next=${encodeURIComponent(next)}` : "/en/sign-in"),
}));
vi.mock("@/lib/api/server", () => ({ apiSessionGet: stub.get, apiSessionList: stub.list }));
vi.mock("@/lib/account/wallet-read", () => ({ readAccountWallet: stub.wallet }));

import ServicesPage, { generateMetadata as listMetadata } from "@/app/en/account/services/page";
import ServicePage from "@/app/en/account/services/[id]/page";

const MERCHANT = { id: 7, rank: { kind: "merchant" } };

const LISTED = {
  id: 5,
  code: "SVC-5",
  name: "Network check",
  type: "imei",
  price: "0.1000",
  currency: "USD",
  slaMinutes: 0,
  deliveryTime: "1-5 min",
  minQty: 1,
  maxQty: 1,
  qtyOptions: [],
  category: { id: 3, name: "Checks" },
} as unknown as MerchantService;

const DETAIL = { ...LISTED, info: "", options: [], fields: [] } as unknown as MerchantServiceDetail;

/** The error the framework's own `redirect` throws, so a stand-in refusal ends the page the way the real one does. */
function redirection(to: string): Error {
  try {
    redirect(to);
  } catch (error) {
    return error as Error;
  }
  throw new Error("redirect did not throw");
}

/** Every element of the tree (without rendering components) whose component has this name. */
function findElement(node: ReactNode, name: string): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, name);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement<Record<string, unknown>>(node)) return null;
  if (typeof node.type === "function" && node.type.name === name) return node;
  return findElement(node.props.children as ReactNode, name);
}

/** Runs the part of a page that reads the session and the API (the async component inside its <Suspense>). */
async function run(page: ReactNode, part: string): Promise<{ done: ReactNode } | { ended: string }> {
  const element = findElement(page, part);
  if (!element) throw new Error(`no <${part}> in the page`);
  try {
    return { done: await (element.type as (props: unknown) => Promise<ReactNode>)(element.props) };
  } catch (error) {
    const digest = String((error as { digest?: unknown }).digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT;")) {
      const parts = digest.split(";");
      return { ended: `redirect:${parts.slice(2, -2).join(";")}` };
    }
    if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return { ended: "404" };
    throw error;
  }
}

const listPage = (search: Record<string, string> = {}) => ServicesPage({ searchParams: Promise.resolve(search) });
const detailPage = (id: string) => ServicePage({ params: Promise.resolve({ id }) });

beforeEach(() => {
  for (const mock of Object.values(stub)) mock.mockReset();
  stub.requireRank.mockResolvedValue(MERCHANT);
  stub.list.mockResolvedValue({ data: [LISTED], total: 1 });
  stub.get.mockResolvedValue(DETAIL);
  stub.wallet.mockResolvedValue({ kind: "merchant", read: { ok: true, data: { available: "12.5000" } } });
});

describe("the price list", () => {
  it("is titled for the account area's price list", async () => {
    expect(listMetadata().title).toBe("Price list");
  });

  it("asks for the merchant rank first, with its own address and filters as the way back, and reads the account's price list", async () => {
    const outcome = await run(listPage({ type: "imei", q: "check", page: "2" }), "Catalog");
    expect("done" in outcome).toBe(true);
    expect(stub.requireRank).toHaveBeenCalledTimes(1);
    expect(stub.requireRank).toHaveBeenCalledWith("merchant", "/en/account/services?q=check&type=imei&page=2");
    expect(stub.requireRank.mock.invocationCallOrder[0]).toBeLessThan(stub.list.mock.invocationCallOrder[0]);
    expect(stub.list.mock.calls.every(([path]) => path === "/client/services")).toBe(true);
  });

  it("sends an account of another rank to the account home and reads nothing", async () => {
    stub.requireRank.mockRejectedValue(redirection("/en/account"));
    expect(await run(listPage(), "Catalog")).toEqual({ ended: "redirect:/en/account" });
    expect(stub.list).not.toHaveBeenCalled();
  });

  it("sends a visitor who is signed out to sign-in, and nothing is read", async () => {
    stub.requireRank.mockRejectedValue(redirection("/en/sign-in?next=%2Fen%2Faccount%2Fservices"));
    expect(await run(listPage(), "Catalog")).toEqual({ ended: "redirect:/en/sign-in?next=%2Fen%2Faccount%2Fservices" });
    expect(stub.list).not.toHaveBeenCalled();
  });

  it("links every row to the service's page in the account area", async () => {
    const outcome = await run(listPage(), "Catalog");
    if (!("done" in outcome)) throw new Error(outcome.ended);
    const table = findElement(outcome.done, "ServicesTable");
    if (!table) throw new Error("no <ServicesTable> in the list");
    const html = renderToStaticMarkup(createElement(table.type as never, table.props));
    expect(html).toContain('href="/en/account/services/5"');
    expect(html).not.toContain("/merchant");
  });
});

describe("one service and its order form", () => {
  it("asks for the merchant rank first, with the service's own address as the way back", async () => {
    const outcome = await run(detailPage("5"), "Service");
    expect("done" in outcome).toBe(true);
    expect(stub.requireRank).toHaveBeenCalledWith("merchant", "/en/account/services/5");
    expect(stub.requireRank.mock.invocationCallOrder[0]).toBeLessThan(stub.get.mock.invocationCallOrder[0]);
    expect(stub.get).toHaveBeenCalledWith("/client/services/5");
  });

  it("sends an account of another rank to the account home and reads neither the service nor the wallet", async () => {
    stub.requireRank.mockRejectedValue(redirection("/en/account"));
    expect(await run(detailPage("5"), "Service")).toEqual({ ended: "redirect:/en/account" });
    expect(stub.get).not.toHaveBeenCalled();
    expect(stub.wallet).not.toHaveBeenCalled();
  });

  it("answers a bad id with the not-found page before it asks for anything", async () => {
    for (const id of ["abc", "0", "5x", "-3"]) expect(await run(detailPage(id), "Service"), id).toEqual({ ended: "404" });
    expect(stub.requireRank).not.toHaveBeenCalled();
    expect(stub.get).not.toHaveBeenCalled();
  });

  it("gives the order form the spendable balance and links that all lead into the account area", async () => {
    const outcome = await run(detailPage("5"), "Service");
    if (!("done" in outcome)) throw new Error(outcome.ended);
    const form = findElement(outcome.done, "OrderForm");
    if (!form) throw new Error("no <OrderForm> on the page");
    expect(form.props.available).toBe("12.5000");
    expect(form.props.hrefs).toEqual({
      orders: "/en/account/orders",
      orderBase: "/en/account/orders",
      topUp: "/en/account/wallet/add-funds",
      services: "/en/account/services",
    });
  });

  it("still shows the form when the wallet cannot be read (no balance line)", async () => {
    stub.wallet.mockResolvedValue({ kind: "merchant", read: { ok: false, error: new Error("down") } });
    const outcome = await run(detailPage("5"), "Service");
    if (!("done" in outcome)) throw new Error(outcome.ended);
    expect(findElement(outcome.done, "OrderForm")?.props.available).toBeNull();
  });

  it("trusts no balance of the other wallet kind", async () => {
    stub.wallet.mockResolvedValue({ kind: "store", read: { ok: true, data: { available: "99.0000" } } });
    const outcome = await run(detailPage("5"), "Service");
    if (!("done" in outcome)) throw new Error(outcome.ended);
    expect(findElement(outcome.done, "OrderForm")?.props.available).toBeNull();
  });

  it("breadcrumbs back to the price list of the account area", async () => {
    const outcome = await run(detailPage("5"), "Service");
    if (!("done" in outcome)) throw new Error(outcome.ended);
    const crumbs = findElement(outcome.done, "Breadcrumbs");
    expect(crumbs?.props.items).toEqual([{ label: "Price list", href: "/en/account/services" }, { label: "Network check" }]);
  });
});
