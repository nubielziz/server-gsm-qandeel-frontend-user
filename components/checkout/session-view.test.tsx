import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The view reads the router from next/navigation and the error texts from the layout's provider.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
// The files `npm run logos` listed: a test says which bundled logos "exist" without needing the files.
const listed = vi.hoisted(() => ({ files: {} as Record<string, number[]> }));
vi.mock("@/lib/payment-logo-sizes.json", () => ({ default: listed.files }));

import type { CheckoutSession } from "@/lib/api/types";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { checkout } from "@/lib/i18n/messages/checkout";
import { common } from "@/lib/i18n/messages/common";
import { errors } from "@/lib/i18n/messages/errors";
import { SessionView } from "./session-view";

const UPLOADED = "/store/v1/media/7db48410b0249faa175969aa2caa6d316adf34466f57a071ce6ad60e7bb1e022.png";
const encoded = (path: string) => encodeURIComponent(path);

/** One payment method of the session: a custom one (no preset, no uploaded logo) unless `extra` says otherwise. */
const gateway = (
  code: string,
  name: string,
  extra: Partial<CheckoutSession["paymentMethods"][number]> = {},
): CheckoutSession["paymentMethods"][number] => ({
  code,
  name,
  supports3ds: false,
  preset: null,
  logoUrl: null,
  ...extra,
});

const session = (paymentMethods: CheckoutSession["paymentMethods"]): CheckoutSession => ({
  token: "tok-1",
  status: "open",
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: "2026-11-17T10:00:00.000Z",
  service: { id: 1, name: "Unlock", type: "imei", deliveryTime: "1-2 days" },
  quantity: 1,
  imei: "***********1234",
  email: "b***@example.com",
  country: "US",
  currency: "USD",
  fxRate: "1.00000000",
  taxRate: "0",
  amounts: {
    usd: { net: "10.0000", tax: "0.0000", gross: "10.0000" },
    display: { net: "10.0000", tax: "0.0000", gross: "10.0000" },
  },
  consent: { required: [], granted: [], complete: true },
  paymentMethods,
  balancePayable: false,
  trackingToken: null,
});

const render = (methods: CheckoutSession["paymentMethods"]) =>
  renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <SessionView
        session={session(methods)}
        labels={checkout.session}
        quantityLabels={common.quantity}
        typeLabel="IMEI"
        decimals={2}
        restartHref={null}
        countryName="United States"
        balance={{ signedIn: false, wallet: null }}
      />
    </ErrorTextProvider>,
  );

beforeEach(() => {
  for (const key of Object.keys(listed.files)) delete listed.files[key];
  listed.files["payments/binance_pay.png"] = [300, 96];
});

describe("checkout: the logo of each payment method", () => {
  const methods = [
    gateway("stripe", "Card gateway", { supports3ds: true }),
    gateway("crypto", "Crypto gateway"),
    gateway("binance-auto", "Binance Pay (automatic)", { preset: "binance_pay_auto" }),
    gateway("partner", "Partner pay", { logoUrl: UPLOADED }),
  ];

  it("shows the bundled logo of a preset and an uploaded logo, each as a picture", () => {
    const html = render(methods);
    expect(html).toContain(encoded("/images/payments/binance_pay.png"));
    expect(html).toContain(encoded(UPLOADED));
    expect(html.match(/<img/g)).toHaveLength(2);
  });

  it("keeps the icon for a method without a logo, chosen by its code as before: a card, a coin", () => {
    const html = render(methods);
    expect(html).toContain("lucide-credit-card");
    expect(html).toContain("lucide-coins");
  });

  it("prints each name once and leaves the radio's name alone: the picture is decorative", () => {
    const html = render(methods);
    expect(html.match(/alt=""/g)).toHaveLength(2);
    for (const name of ["Card gateway", "Crypto gateway", "Binance Pay (automatic)", "Partner pay"]) {
      expect(html.split(name), name).toHaveLength(2);
    }
    expect(html.match(/type="radio"/g)).toHaveLength(4);
  });

  it("draws the icon when the preset's file is not listed", () => {
    for (const key of Object.keys(listed.files)) delete listed.files[key];
    const html = render([gateway("binance-auto", "Binance Pay (automatic)", { preset: "binance_pay_auto" })]);
    expect(html).not.toContain("<img");
    expect(html).toContain("lucide-coins");
  });

  it("is the same list as before for the methods of today: no key, no picture", () => {
    const html = render([gateway("stripe", "Card gateway", { supports3ds: true })]);
    expect(html).not.toContain("<img");
    expect(html).toContain("lucide-credit-card");
  });
});
