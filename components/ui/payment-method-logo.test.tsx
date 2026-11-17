import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The files `npm run logos` listed: a test says which bundled logos "exist" without needing the files.
const listed = vi.hoisted(() => ({ files: {} as Record<string, number[]> }));
vi.mock("@/lib/payment-logo-sizes.json", () => ({ default: listed.files }));

import { PaymentMethodLogo } from "./payment-method-logo";

const UPLOADED = "/store/v1/media/7db48410b0249faa175969aa2caa6d316adf34466f57a071ce6ad60e7bb1e022.png";
const encoded = (path: string) => encodeURIComponent(path);

const render = (props: Partial<Parameters<typeof PaymentMethodLogo>[0]> = {}) =>
  renderToStaticMarkup(<PaymentMethodLogo name="Vodafone Cash" {...props} />);

beforeEach(() => {
  for (const key of Object.keys(listed.files)) delete listed.files[key];
  listed.files["payments/vodafone_cash.png"] = [96, 96];
  listed.files["payments/binance_pay.png"] = [300, 96];
});

describe("PaymentMethodLogo: the uploaded logo comes first", () => {
  it("draws the uploaded picture, with the method's name as its alternative text", () => {
    const html = render({ logoUrl: UPLOADED });
    expect(html).toContain("<img");
    expect(html).toContain(encoded(UPLOADED));
    expect(html).toContain('alt="Vodafone Cash"');
    expect(html).not.toContain("<svg");
  });

  it("wins over the bundled logo of the preset", () => {
    const html = render({ logoUrl: UPLOADED, preset: "vodafone_cash" });
    expect(html).toContain(encoded(UPLOADED));
    expect(html).not.toContain(encoded("/images/payments/vodafone_cash.png"));
  });

  it("trusts only a media path of this site: any other address falls through to the preset, then the icon", () => {
    for (const bad of [
      "https://evil.example/store/v1/media/a.png",
      "//evil.example/a.png",
      "/images/payments/vodafone_cash.png",
      "javascript:alert(1)",
      "",
    ]) {
      expect(render({ logoUrl: bad }), bad).not.toContain("<img");
    }
    const withPreset = render({ logoUrl: "https://evil.example/a.png", preset: "vodafone_cash" });
    expect(withPreset).toContain(encoded("/images/payments/vodafone_cash.png"));
    expect(withPreset).not.toContain("evil.example");
  });
});

describe("PaymentMethodLogo: the bundled logo of the preset", () => {
  it("draws the file of the preset when it is listed", () => {
    const html = render({ preset: "vodafone_cash" });
    expect(html).toContain("<img");
    expect(html).toContain(encoded("/images/payments/vodafone_cash.png"));
    expect(html).toContain('alt="Vodafone Cash"');
  });

  it("gives the automatic Binance Pay the logo of Binance Pay", () => {
    expect(render({ name: "Binance Pay (automatic)", preset: "binance_pay_auto" })).toContain(encoded("/images/payments/binance_pay.png"));
    expect(render({ name: "Binance Pay", preset: "binance_pay" })).toContain(encoded("/images/payments/binance_pay.png"));
  });

  it("shows the icon of the method when the file is not listed (not added yet)", () => {
    const html = render({ name: "InstaPay", preset: "instapay", methodType: "bank" });
    expect(html).not.toContain("<img");
    expect(html).toContain("lucide-landmark");
  });

  it("shows the icon for a preset without a logo (bank transfer, crypto transfer) and for one it does not know", () => {
    expect(render({ preset: "bank_transfer" })).toContain("lucide-landmark");
    expect(render({ preset: "crypto_transfer" })).toContain("lucide-coins");
    expect(render({ preset: "constructor", methodType: "card" })).toContain("lucide-credit-card");
    expect(render({ preset: "something_new" })).not.toContain("<img");
  });
});

describe("PaymentMethodLogo: the icon of a method without a logo", () => {
  it("is a bank, a coin, a card or banknotes by methodType, as the top-up lists have always drawn them", () => {
    expect(render({ methodType: "bank" })).toContain("lucide-landmark");
    expect(render({ methodType: "usdt" })).toContain("lucide-coins");
    expect(render({ methodType: "card" })).toContain("lucide-credit-card");
    expect(render({ methodType: "wise" })).toContain("lucide-banknote");
  });

  it("reads the checkout's method by its code, which has no methodType", () => {
    expect(render({ code: "crypto-gateway" })).toContain("lucide-coins");
    expect(render({ code: "usdt" })).toContain("lucide-coins");
    expect(render({ code: "stripe" })).toContain("lucide-credit-card");
    expect(render({ code: "card" })).toContain("lucide-credit-card");
    expect(render({ code: "bank-transfer" })).toContain("lucide-landmark");
    expect(render({ code: "something" })).toContain("lucide-credit-card");
    expect(render({})).toContain("lucide-credit-card");
  });

  it("lets methodType decide before the preset and the code", () => {
    expect(render({ methodType: "bank", preset: "nowpayments", code: "crypto" })).toContain("lucide-landmark");
  });

  it("is hidden from assistive technology and has no picture", () => {
    const html = render({ methodType: "bank" });
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<img");
  });
});

describe("PaymentMethodLogo: alternative text", () => {
  it("is empty when the caller says the name is printed beside the picture", () => {
    expect(render({ logoUrl: UPLOADED, alt: "" })).toContain('alt=""');
    expect(render({ preset: "vodafone_cash", alt: "" })).toContain('alt=""');
    expect(render({ preset: "vodafone_cash", alt: "" })).not.toContain("Vodafone Cash");
  });
});
