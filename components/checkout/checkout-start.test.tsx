// The page that opens a checkout (`/checkout?service=<slug>`): what each kind of visitor is shown. A retail account gets the form with
// its own email locked; a merchant rank gets the notice that leads to its price list and the form is never mounted (so no checkout
// session can be created for it); a visitor gets the guest form, or the way to sign in when guest checkout is off. The reads are
// replaced; the page's own code runs and its tree is read without rendering the components in it.
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

/** Runs the page down to what the account part of it returns. */
async function opened(): Promise<ReactNode> {
  const page = CheckoutPage({ searchParams: Promise.resolve({ service: SERVICE.slug }) } as never);
  const content = find(page, named("CheckoutContent"));
  const tree = await (content!.type as (props: unknown) => Promise<ReactNode>)(content!.props);
  const account = find(tree, named("AccountCheckout"));
  return (account!.type as (props: unknown) => Promise<ReactNode>)(account!.props);
}

describe("the page that opens a checkout", () => {
  it("shows a retail account the form with its email locked and its country filled in", async () => {
    reads.account.mockResolvedValue(RETAIL);
    const form = find(await opened(), (element) => element.type === CheckoutForm);
    expect(form).not.toBeNull();
    expect(form!.props.account).toEqual({ email: "buyer@example.com", country: "DE" });
  });

  it("shows a merchant rank the price list notice and never mounts the form, so no checkout session is created", async () => {
    reads.account.mockResolvedValue(MERCHANT);
    const shown = await opened();
    expect(find(shown, (element) => element.type === CheckoutForm)).toBeNull();
    const card = find(shown, (element) => element.type === PriceListCard);
    expect(card).not.toBeNull();
    expect(card!.props.priceListHref).toBe("/en/account/services/42");
    expect(card!.props.serviceHref).toBe("/en/services/icloud-clean");
  });

  it("shows a merchant rank the notice even when guest checkout is off", async () => {
    reads.account.mockResolvedValue(MERCHANT);
    reads.config.mockResolvedValue({ currencies: [], taxRates: [], policies: { guestCheckout: false } });
    const shown = await opened();
    expect(find(shown, (element) => element.type === PriceListCard)).not.toBeNull();
    expect(find(shown, (element) => element.type === CheckoutForm)).toBeNull();
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
