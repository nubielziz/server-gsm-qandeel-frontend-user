// The details step of the shop checkout: a signed-in account of a retail rank has its email locked and its country filled in;
// a guest types both and is offered the one sign-in page (which names no account type).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The form reads the router from next/navigation and the error texts from the layout's provider.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));

import type { StoreConfig, StoreServiceDetail } from "@/lib/api/types";
import { checkoutBuyerOf, checkoutSignInHref } from "@/lib/checkout/access";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { checkout } from "@/lib/i18n/messages/checkout";
import { common } from "@/lib/i18n/messages/common";
import { errors } from "@/lib/i18n/messages/errors";
import { CheckoutForm, type CheckoutFormProps } from "./checkout-form";

const PRICE: StoreServiceDetail["price"] = {
  currency: "USD",
  fxRate: "1.00000000",
  net: "3.9900",
  tax: "0.0000",
  gross: "3.9900",
  taxRate: "0",
  taxCountry: null,
};

const props = (account: CheckoutFormProps["account"]): CheckoutFormProps => ({
  labels: checkout.start,
  quantityLabels: common.quantity,
  deliveryLabels: common.delivery,
  typeLabel: "IMEI check",
  service: {
    id: 42,
    slug: "icloud-clean",
    title: "iCloud Clean",
    isImei: true,
    quantity: { min: 1, max: 1, options: [] },
    availability: "on_request",
    etaText: "",
    deliveryMinutes: 2,
    fields: [],
    price: PRICE,
  },
  art: null,
  currencies: [{ code: "USD", name: "US dollar", decimals: 2, fxRate: "1.00000000" }] as StoreConfig["currencies"],
  currency: "USD",
  taxRates: [],
  countries: [
    { code: "DE", name: "Germany" },
    { code: "GB", name: "United Kingdom" },
  ],
  account,
  signInHref: checkoutSignInHref("/en/checkout?service=icloud-clean"),
  supportHref: "/en/support",
});

const render = (account: CheckoutFormProps["account"]) =>
  renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <CheckoutForm {...props(account)} />
    </ErrorTextProvider>,
  );

describe("CheckoutForm: whose details it opens with", () => {
  it("locks a retail account's email and fills in its country", () => {
    const html = render(checkoutBuyerOf({ email: "buyer@example.com", country: "DE", rank: { kind: "retail" } }));
    expect(html).toMatch(
      /<input[^>]*name="email"[^>]*value="buyer@example.com"[^>]*readOnly=""|<input[^>]*readOnly=""[^>]*name="email"/,
    );
    expect(html).toContain("You are signed in. Orders use your account email.");
    expect(html).toMatch(/<option value="DE" selected/);
    expect(html).not.toContain("Have an account?");
  });

  it("leaves a guest's email to type, and offers the one sign-in page", () => {
    const html = render(null);
    expect(html).not.toContain("readOnly");
    expect(html).toContain("Have an account?");
    expect(html).toContain('href="/en/sign-in?next=%2Fen%2Fcheckout%3Fservice%3Dicloud-clean"');
    expect(html).not.toContain("as=");
  });

  it("is never opened for a merchant rank: there is no buyer to open it for", () => {
    expect(checkoutBuyerOf({ email: "ops@example.com", country: "JO", rank: { kind: "merchant" } })).toBeNull();
  });

  it("does not show the price list card while the form is the way in", () => {
    const html = render(null);
    expect(html).not.toContain("The shop checkout is for retail buyers");
    expect(html).toContain("Continue to payment");
  });
});
