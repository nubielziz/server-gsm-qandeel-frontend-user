// The page that opens a checkout (`/checkout?service=<slug>`): what each kind of visitor is shown. A retail account gets the form with
// its own email locked; a merchant rank gets its own order form at the same address (decision 003) and the shop's form is never
// mounted (so no checkout session can be created for it); a visitor gets the guest form, or the way to sign in when guest checkout
// is off. A file service: the notice to order it through support for everybody but a merchant rank, whose order form takes it.
// The reads are replaced; the page's own code runs and its tree is read without rendering the components in it.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ account: vi.fn(), config: vi.fn(), service: vi.fn() }));

vi.mock("next/navigation", () => ({ permanentRedirect: vi.fn(), useRouter: () => ({ push() {}, refresh() {}, replace() {} }) }));
vi.mock("@/lib/api/session", () => ({ getAccount: reads.account }));
vi.mock("@/lib/api/public", () => ({ getStoreConfig: reads.config }));
vi.mock("@/lib/currency", () => ({ getCurrency: async () => ({ code: "USD", decimals: 2 }) }));
vi.mock("@/components/store/resolve-service", () => ({ resolveService: reads.service }));

import CheckoutPage from "@/app/en/(checkout)/checkout/page";
import { CheckoutForm } from "./checkout-form";
import { MerchantCheckout } from "./merchant-checkout";
import { PriceListCard } from "./price-list-card";

type Element = ReactElement<Record<string, unknown>>;

const SERVICE = {
  id: 42,
  slug: "icloud-clean",
  title: "iCloud Clean",
  type: "imei",
  quantity: { min: 1, max: 1, options: [] },
  availability: "on_request",
  etaText: "",
  deliveryMinutes: 2,
  fields: [],
  price: { currency: "USD", fxRate: "1.00000000", net: "3.9900", tax: "0.0000", gross: "3.9900", taxRate: "0", taxCountry: null },
};

const RETAIL = { id: 1, email: "buyer@example.com", country: "DE", rank: { id: 1, name: "Retail", kind: "retail" } };
const MERCHANT = { id: 2, email: "ops@example.com", country: "JO", rank: { id: 2, name: "Gold", kind: "merchant" } };

beforeEach(() => {
  reads.account.mockReset();
  reads.config.mockReset().mockResolvedValue({ currencies: [], taxRates: [], policies: { guestCheckout: true } });
  reads.service.mockReset().mockResolvedValue({ kind: "found", service: SERVICE });
});

/** The first element of the tree (components not rendered) that satisfies `match`. */
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
  // Children and every other prop that holds elements (an empty state's `action`, for one).
  for (const value of Object.values(node.props)) {
    const found = find(value as ReactNode, match);
    if (found) return found;
  }
  return null;
}

const named = (name: string) => (element: Element) => typeof element.type === "function" && element.type.name === name;

/** Runs the page down to the account part's boundary (its fallback) and what the account part returns. */
async function openedWithFallback(): Promise<{ fallback: ReactNode; shown: ReactNode }> {
  const page = CheckoutPage({ searchParams: Promise.resolve({ service: SERVICE.slug }) } as never);
  const content = find(page, named("CheckoutContent"));
  const tree = (await (content!.type as (props: unknown) => Promise<ReactNode>)(content!.props)) as Element;
  const account = find(tree, named("AccountCheckout"));
  const shown = await (account!.type as (props: unknown) => Promise<ReactNode>)(account!.props);
  return { fallback: tree.props.fallback as ReactNode, shown };
}

/** Runs the page down to what the account part of it returns. */
async function opened(): Promise<ReactNode> {
  return (await openedWithFallback()).shown;
}

describe("the page that opens a checkout", () => {
  it("shows a retail account the form with its email locked and its country filled in", async () => {
    reads.account.mockResolvedValue(RETAIL);
    const form = find(await opened(), (element) => element.type === CheckoutForm);
    expect(form).not.toBeNull();
    expect(form!.props.account).toEqual({ email: "buyer@example.com", country: "DE" });
  });

  it("mounts a merchant rank's own order form and never the shop's form, so no checkout session is created", async () => {
    reads.account.mockResolvedValue(MERCHANT);
    const shown = await opened();
    expect(find(shown, (element) => element.type === CheckoutForm)).toBeNull();
    expect(find(shown, (element) => element.type === PriceListCard)).toBeNull();
    const own = find(shown, (element) => element.type === MerchantCheckout);
    expect(own).not.toBeNull();
    expect(own!.props).toEqual({
      serviceId: 42,
      next: "/en/checkout?service=icloud-clean",
      serviceHref: "/en/services/icloud-clean",
    });
  });

  it("mounts the merchant order form even when guest checkout is off", async () => {
    reads.account.mockResolvedValue(MERCHANT);
    reads.config.mockResolvedValue({ currencies: [], taxRates: [], policies: { guestCheckout: false } });
    const shown = await opened();
    expect(find(shown, (element) => element.type === MerchantCheckout)).not.toBeNull();
    expect(find(shown, (element) => element.type === CheckoutForm)).toBeNull();
  });

  it("never mounts the merchant order form for a retail account or a visitor", async () => {
    for (const me of [RETAIL, null]) {
      reads.account.mockResolvedValue(me);
      expect(find(await opened(), (element) => element.type === MerchantCheckout), JSON.stringify(me)).toBeNull();
    }
  });

  it("a file service: a merchant rank gets its order form, everybody else the notice to order through support at once", async () => {
    reads.service.mockResolvedValue({ kind: "found", service: { ...SERVICE, type: "file" } });
    const isNotice = (element: Element) => element.props.title === "This service cannot be bought online yet";

    reads.account.mockResolvedValue(MERCHANT);
    const merchant = await openedWithFallback();
    expect(find(merchant.shown, (element) => element.type === MerchantCheckout)).not.toBeNull();

    for (const me of [RETAIL, null]) {
      reads.account.mockResolvedValue(me);
      const { fallback, shown } = await openedWithFallback();
      expect(find(shown, isNotice), JSON.stringify(me)).not.toBeNull();
      expect(find(shown, (element) => element.type === CheckoutForm)).toBeNull();
      // The boundary's fallback is the same notice, so a guest sees it before the account is read: nothing changes for it.
      expect(find(fallback, isNotice)).not.toBeNull();
    }
  });

  it("shows a visitor who is signed out the guest form with no account", async () => {
    reads.account.mockResolvedValue(null);
    const form = find(await opened(), (element) => element.type === CheckoutForm);
    expect(form).not.toBeNull();
    expect(form!.props.account).toBeNull();
    // The way to sign in names no account type and comes back to this checkout.
    expect(String(form!.props.signInHref)).toBe("/en/sign-in?next=%2Fen%2Fcheckout%3Fservice%3Dicloud-clean");
  });

  it("shows a visitor who is signed out only the way to sign in when guest checkout is off", async () => {
    reads.account.mockResolvedValue(null);
    reads.config.mockResolvedValue({ currencies: [], taxRates: [], policies: { guestCheckout: false } });
    const shown = await opened();
    expect(find(shown, (element) => element.type === CheckoutForm)).toBeNull();
    expect(find(shown, (element) => element.type === PriceListCard)).toBeNull();
    const action = find(shown, (element) => typeof element.props.href === "string");
    expect(action?.props.href).toBe("/en/sign-in?next=%2Fen%2Fcheckout%3Fservice%3Dicloud-clean");
  });
});
