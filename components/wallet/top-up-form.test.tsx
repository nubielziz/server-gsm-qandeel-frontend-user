import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The form reads the router from next/navigation and the error texts from the layout's provider.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
// The files `npm run logos` listed: a test says which bundled logos "exist" without needing the files.
const listed = vi.hoisted(() => ({ files: {} as Record<string, number[]> }));
vi.mock("@/lib/payment-logo-sizes.json", () => ({ default: listed.files }));

import type { TopUpMethod } from "@/lib/api/types";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { errors } from "@/lib/i18n/messages/errors";
import { topUps } from "@/lib/i18n/messages/top-ups";
import { TopUpForm } from "./top-up-form";

const UPLOADED = "/store/v1/media/7db48410b0249faa175969aa2caa6d316adf34466f57a071ce6ad60e7bb1e022.png";
const encoded = (path: string) => encodeURIComponent(path);

const method = (id: number, extra: Partial<TopUpMethod>): TopUpMethod => ({
  id,
  code: `method-${id}`,
  name: `Method ${id}`,
  kind: "manual",
  methodType: "bank",
  feePercent: "0",
  feeFixed: "0.0000",
  minAmount: "0.0000",
  maxAmount: "0.0000",
  currency: "USD",
  holdHours: 0,
  instructions: "",
  preset: null,
  logoUrl: null,
  ...extra,
});

const limits = {
  minTopUp: "5.0000",
  maxTopUp: "1000.0000",
  maxBalance: "5000.0000",
  room: "5000.0000",
  topUpsLeftToday: 5,
  amountLeftToday: "2000.0000",
};

function render(methods: TopUpMethod[], frozen = false) {
  return renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <TopUpForm
        methods={methods}
        limits={limits}
        frozen={frozen}
        detailBase="/en/account/wallet/top-ups"
        labels={topUps.form}
        errors={topUps.errors}
      />
    </ErrorTextProvider>,
  );
}

beforeEach(() => {
  for (const key of Object.keys(listed.files)) delete listed.files[key];
  listed.files["payments/vodafone_cash.png"] = [96, 96];
});

describe("customer top-up form: the logo of each method", () => {
  const methods = [
    method(1, { name: "Vodafone Cash", preset: "vodafone_cash", logoUrl: null }),
    method(2, { name: "Our bank", preset: "bank_transfer", logoUrl: null }),
    method(3, { name: "Partner wallet", preset: null, logoUrl: UPLOADED, methodType: "usdt" }),
    method(4, { name: "Crypto gateway", kind: "automatic", methodType: "usdt" }),
  ];

  it("shows the bundled logo of a preset and the uploaded logo of a custom method, each as a picture", () => {
    const html = render(methods);
    expect(html).toContain(encoded("/images/payments/vodafone_cash.png"));
    expect(html).toContain(encoded(UPLOADED));
    expect(html.match(/<img/g)).toHaveLength(2);
  });

  it("keeps the icon of a method without a logo", () => {
    const html = render(methods);
    expect(html).toContain("lucide-landmark");
    expect(html).toContain("lucide-coins");
  });

  it("prints each name once: the picture is decorative, so a radio's name is not said twice", () => {
    const html = render(methods);
    expect(html.match(/alt=""/g)).toHaveLength(2);
    for (const name of ["Vodafone Cash", "Our bank", "Partner wallet", "Crypto gateway"]) {
      expect(html.split(name), name).toHaveLength(2);
    }
  });

  it("draws the icon of the methods when no logo file is listed yet", () => {
    for (const key of Object.keys(listed.files)) delete listed.files[key];
    const html = render([method(1, { name: "Vodafone Cash", preset: "vodafone_cash" })]);
    expect(html).not.toContain("<img");
    expect(html).toContain("lucide-landmark");
  });

  it("still shows the logo of an online method that is not offered while the balance is on hold", () => {
    const html = render(
      [method(1, { name: "Binance Pay (automatic)", kind: "automatic", preset: "binance_pay_auto", logoUrl: UPLOADED })],
      true,
    );
    expect(html).toContain(encoded(UPLOADED));
    expect(html).toContain("disabled");
  });

  it("is the same list as before for the methods of today: one radio per method, no picture, the icon of its type (Wise keeps its banknotes)", () => {
    const html = render([
      method(1, { name: "Bank transfer" }),
      method(2, { name: "Card", kind: "automatic", methodType: "card" }),
      method(3, { name: "Wise", methodType: "wise" }),
      method(4, { name: "USDT", methodType: "usdt" }),
    ]);
    expect(html.match(/type="radio"/g)).toHaveLength(4);
    expect(html).not.toContain("<img");
    for (const icon of ["landmark", "credit-card", "banknote", "coins"]) expect(html, icon).toContain(`lucide-${icon}`);
  });
});
