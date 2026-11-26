// The checkout of an account of a merchant rank (decision 003): its own order form, at its own price read from its catalog, with
// its wallet's spendable balance; a service it may not order says so; a signed-out session goes to sign-in. The reads are
// replaced; the component's tree is read without rendering the components in it.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ get: vi.fn(), wallet: vi.fn(), redirect: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    reads.redirect(to);
    throw new Error(`redirect:${to}`);
  },
  notFound: () => {
    throw new Error("not-found");
  },
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
}));
vi.mock("@/lib/api/server", () => ({ apiSessionGet: reads.get }));
vi.mock("@/lib/account/wallet-read", () => ({ readAccountWallet: reads.wallet }));

import { ApiError } from "@/lib/api/errors";
import { OrderForm } from "@/components/merchant/order-form";
import { PageError } from "@/components/merchant/page-error";
import { ServiceAbout } from "@/components/merchant/service-about";
import { MerchantCheckout } from "./merchant-checkout";

type Element = ReactElement<Record<string, unknown>>;

function find(node: ReactNode, match: (element: Element) => boolean): Element | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, match);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement<Record<string, unknown>>(node)) return null;
  if (match(node)) return node;
  for (const value of Object.values(node.props)) {
    const found = find(value as ReactNode, match);
    if (found) return found;
  }
  return null;
}

const SERVICE = {
  id: 42,
  name: "iCloud Clean",
  code: "IMEI-ICLOUD",
  type: "imei",
  category: { id: 1, name: "Apple" },
  price: "3.2000",
  currency: "USD",
  deliveryTime: "2 min",
  slaMinutes: 2,
  info: "",
  minQty: 1,
  maxQty: 1,
  qtyOptions: [],
  // An IMEI service lists its IMEI as a field the API flags `isMainInput` (decision 007).
  fields: [{ key: "imei", label: "IMEI", fieldType: "text", required: true, isMainInput: true, options: [], regex: "" }],
  options: [],
};

const PROPS = { serviceId: 42, next: "/en/checkout?service=icloud-clean", serviceHref: "/en/services/icloud-clean" };

beforeEach(() => {
  reads.get.mockReset().mockResolvedValue(SERVICE);
  reads.wallet.mockReset().mockResolvedValue({ kind: "merchant", read: { ok: true, data: { available: "15.0000" } } });
  reads.redirect.mockReset();
});

describe("MerchantCheckout", () => {
  it("mounts the order form at the account's own price, read from its own catalog, with its spendable balance", async () => {
    const tree = await MerchantCheckout(PROPS);
    expect(reads.get).toHaveBeenCalledWith("/client/services/42");
    const form = find(tree, (element) => element.type === OrderForm);
    expect(form).not.toBeNull();
    expect(form!.props.service).toMatchObject({ id: 42, price: "3.2000", currency: "USD", type: "imei" });
    // Every field of the service goes to the form, the IMEI's box included: it draws them all (decision 007).
    expect(form!.props.service).toMatchObject({ fields: [{ key: "imei", isMainInput: true }] });
    expect(form!.props.available).toBe("15.0000");
    expect(form!.props.hrefs).toMatchObject({ orderBase: "/en/account/orders", services: "/en/services" });
    expect(form!.props.labels).toMatchObject({ placed: { one: "Order #{id} placed" } });
    expect(find(form!.props.intro as ReactNode, (element) => element.type === ServiceAbout)).not.toBeNull();
  });

  it("leaves the balance out when the wallet could not be read; the order form still opens", async () => {
    reads.wallet.mockResolvedValue({ kind: "merchant", read: { ok: false, error: new Error("down") } });
    const form = find(await MerchantCheckout(PROPS), (element) => element.type === OrderForm);
    expect(form!.props.available).toBeNull();
  });

  it("a service the account may not order: says so and leads back to the service, with no form", async () => {
    reads.get.mockRejectedValue(new ApiError({ status: 404, code: "NOT_FOUND" }));
    const tree = await MerchantCheckout(PROPS);
    expect(find(tree, (element) => element.type === OrderForm)).toBeNull();
    expect(find(tree, (element) => element.props.title === "Not available for your account")).not.toBeNull();
    expect(find(tree, (element) => element.props.href === "/en/services/icloud-clean")).not.toBeNull();
  });

  it("any other failure shows the error inside the page, never the order form", async () => {
    reads.get.mockRejectedValue(new ApiError({ status: 500, code: "INTERNAL_ERROR", requestId: "req-1" }));
    const tree = await MerchantCheckout(PROPS);
    expect(find(tree, (element) => element.type === OrderForm)).toBeNull();
    const error = find(tree, (element) => element.type === PageError);
    expect(error?.props.next).toBe("/en/checkout?service=icloud-clean");
  });
});
