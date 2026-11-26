// The details step of the shop checkout: a signed-in account of a retail rank has its email locked and its country filled in;
// a guest types both and is offered the one sign-in page (which names no account type). The drawer draws only the fields the
// service lists (decision 007) and draws each by its own type (decision 008): a field of type `imei` is a numeric box, whatever its
// key and label and whatever the type of the service.
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

type Field = StoreServiceDetail["fields"][number];

/** A field of type `imei`: the API names its key and label, the form hard-codes neither. */
const IMEI_FIELD: Field = { key: "imei_number", label: "Device IMEI", fieldType: "imei", options: [], required: true, isMainInput: true };
const MODEL_FIELD: Field = { key: "model", label: "Phone model", fieldType: "text", options: [], required: false, isMainInput: false };

const props = (account: CheckoutFormProps["account"], fields: Field[] = [IMEI_FIELD]): CheckoutFormProps => ({
  labels: checkout.start,
  quantityLabels: common.quantity,
  deliveryLabels: common.delivery,
  typeLabel: "IMEI check",
  service: {
    id: 42,
    slug: "icloud-clean",
    title: "iCloud Clean",
    quantity: { min: 1, max: 1, options: [] },
    availability: "on_request",
    etaText: "",
    deliveryMinutes: 2,
    fields,
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

const render = (account: CheckoutFormProps["account"], fields?: Field[]) =>
  renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <CheckoutForm {...props(account, fields)} />
    </ErrorTextProvider>,
  );

/** The `<input>` tag of a field, by its name. */
const inputOf = (html: string, name: string) => new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(html)?.[0] ?? "";

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

describe("CheckoutForm: every field is drawn by its own type, whatever the type of the service (decision 008)", () => {
  it("draws a field of type imei, with its own label, as a one-line numeric box with the IMEI hint", () => {
    const html = render(null);
    const box = inputOf(html, "imei_number");
    expect(box).toContain('inputMode="numeric"');
    expect(box).toContain('autoComplete="off"');
    expect(box).toContain('dir="ltr"');
    expect(box).not.toContain('type="number"');
    expect(box).toContain('maxLength="24"');
    expect(html).toContain("Device IMEI");
    expect(html).toContain(checkout.start.drawer.imeiHint);
    // No built-in box is left: neither its name nor its old label.
    expect(html).not.toContain('name="imei"');
    expect(html).not.toContain("IMEI number");
  });

  it("an imei field follows its own Required tick: optional when it is not required", () => {
    const required = render(null, [IMEI_FIELD]);
    expect(required).not.toContain(checkout.start.drawer.optional);
    const optional = render(null, [{ ...IMEI_FIELD, required: false }]);
    expect(optional).toContain(checkout.start.drawer.optional);
  });

  it("draws the field flagged isMainInput by its own type: a text field stays a text box with no numeric keyboard", () => {
    const html = render(null, [{ ...IMEI_FIELD, fieldType: "text" }]);
    const box = inputOf(html, "imei_number");
    expect(box).not.toContain("inputMode");
    expect(html).not.toContain(checkout.start.drawer.imeiHint);
    expect(html).toContain("Device IMEI");
  });

  it("draws the field flagged isMainInput by its own type, whatever that type is: a select, a textarea, a number box", () => {
    const flagged = (fieldType: Field["fieldType"], options: string[] = []): Field => ({ ...IMEI_FIELD, fieldType, options });

    const select = render(null, [flagged("select", ["Model A", "Model B"])]);
    expect(select).toMatch(/<select[^>]*name="imei_number"/);
    expect(select).toContain('<option value="Model A"');
    expect(select).toContain('<option value="Model B"');
    expect(inputOf(select, "imei_number")).toBe("");

    const textarea = render(null, [flagged("textarea")]);
    expect(textarea).toMatch(/<textarea[^>]*name="imei_number"/);
    expect(inputOf(textarea, "imei_number")).toBe("");

    const number = render(null, [flagged("number")]);
    expect(inputOf(number, "imei_number")).toContain('type="number"');
    expect(inputOf(number, "imei_number")).not.toContain('inputMode="numeric"');

    for (const html of [select, textarea, number]) expect(html).not.toContain(checkout.start.drawer.imeiHint);
  });

  it("draws every other field of the service as an ordinary one, after the IMEI, with no numeric keyboard", () => {
    const html = render(null, [IMEI_FIELD, MODEL_FIELD]);
    expect(html.indexOf('name="imei_number"')).toBeGreaterThan(-1);
    expect(html.indexOf('name="model"')).toBeGreaterThan(html.indexOf('name="imei_number"'));
    expect(inputOf(html, "model")).not.toContain("inputMode");
    expect(html).toContain("Phone model");
  });

  it("draws the IMEI where the API puts it among the fields, never above them", () => {
    const html = render(null, [MODEL_FIELD, IMEI_FIELD]);
    expect(html.indexOf('name="model"')).toBeLessThan(html.indexOf('name="imei_number"'));
  });

  it("a service with no fields asks nothing and never says it cannot be ordered", () => {
    for (const fields of [[], [MODEL_FIELD]]) {
      const html = render(null, fields);
      expect(html).not.toContain("can&#x27;t be ordered right now");
      expect(html).not.toContain("checkout-unorderable");
      expect(html).not.toContain("Contact support");
    }
    const empty = render(null, []);
    expect(empty).toContain("No extra details needed");
    expect(empty).not.toContain("Enter details");
  });
});
