import { beforeEach, describe, expect, it, vi } from "vitest";

// The files `npm run logos` listed: a test says which bundled logos "exist" without needing the files.
const listed = vi.hoisted(() => ({ files: {} as Record<string, number[]> }));
vi.mock("@/lib/payment-logo-sizes.json", () => ({ default: listed.files }));

import { bundledPaymentLogo, paymentIconKind, paymentLogoSources } from "./logos";

const UPLOADED = "/store/v1/media/7db48410b0249faa175969aa2caa6d316adf34466f57a071ce6ad60e7bb1e022.webp";

beforeEach(() => {
  for (const key of Object.keys(listed.files)) delete listed.files[key];
});

describe("bundledPaymentLogo: only a listed file is shown", () => {
  it("names the file of each preset that has a logo, once it is listed", () => {
    for (const file of ["vodafone_cash", "fawry_transfer", "instapay", "binance_pay", "nowpayments"])
      listed.files[`payments/${file}.png`] = [96, 96];
    expect(bundledPaymentLogo("vodafone_cash")).toBe("/images/payments/vodafone_cash.png");
    expect(bundledPaymentLogo("fawry_transfer")).toBe("/images/payments/fawry_transfer.png");
    expect(bundledPaymentLogo("instapay")).toBe("/images/payments/instapay.png");
    expect(bundledPaymentLogo("binance_pay")).toBe("/images/payments/binance_pay.png");
    expect(bundledPaymentLogo("nowpayments")).toBe("/images/payments/nowpayments.png");
  });

  it("gives binance_pay_auto the file of binance_pay", () => {
    listed.files["payments/binance_pay.png"] = [300, 96];
    expect(bundledPaymentLogo("binance_pay_auto")).toBe("/images/payments/binance_pay.png");
  });

  it("is null for a file that is not listed", () => {
    expect(bundledPaymentLogo("vodafone_cash")).toBeNull();
    listed.files["payments/instapay.png"] = [96, 96];
    expect(bundledPaymentLogo("vodafone_cash")).toBeNull();
  });

  it("is null for a preset without a logo, an unknown one, an empty one and a name from the object prototype", () => {
    for (const file of ["bank_transfer", "crypto_transfer"]) listed.files[`payments/${file}.png`] = [96, 96];
    for (const preset of ["bank_transfer", "crypto_transfer", "something_new", "constructor", "__proto__", "", null, undefined]) {
      expect(bundledPaymentLogo(preset), String(preset)).toBeNull();
    }
  });
});

describe("paymentLogoSources: the uploaded logo, then the bundled one", () => {
  it("lists the uploaded logo first, then the bundled logo of the preset (the fallback of a picture that fails to load)", () => {
    listed.files["payments/vodafone_cash.png"] = [96, 96];
    expect(paymentLogoSources({ logoUrl: UPLOADED, preset: "vodafone_cash" })).toEqual([UPLOADED, "/images/payments/vodafone_cash.png"]);
  });

  it("lists what exists: one picture, or none", () => {
    listed.files["payments/vodafone_cash.png"] = [96, 96];
    expect(paymentLogoSources({ logoUrl: null, preset: "vodafone_cash" })).toEqual(["/images/payments/vodafone_cash.png"]);
    expect(paymentLogoSources({ preset: "vodafone_cash" })).toEqual(["/images/payments/vodafone_cash.png"]);
    expect(paymentLogoSources({ logoUrl: UPLOADED, preset: "instapay" })).toEqual([UPLOADED]);
    expect(paymentLogoSources({ logoUrl: null, preset: null })).toEqual([]);
    expect(paymentLogoSources({})).toEqual([]);
  });

  it("does not trust a logo address that is not one media file of this site", () => {
    for (const bad of [
      "https://evil.example/a.png",
      "/store/v1/media/",
      "/store/v1/media/a/b.png",
      "/store/v1/media/a.png?w=1",
      "data:image/png;base64,AAAA",
    ]) {
      expect(paymentLogoSources({ logoUrl: bad }), bad).toEqual([]);
    }
  });
});

describe("paymentIconKind", () => {
  it("follows methodType first: the four types of the top-up lists, each its own icon", () => {
    expect(paymentIconKind({ methodType: "bank" })).toBe("bank");
    expect(paymentIconKind({ methodType: "usdt" })).toBe("crypto");
    expect(paymentIconKind({ methodType: "card" })).toBe("card");
    expect(paymentIconKind({ methodType: "wise" })).toBe("transfer");
    expect(paymentIconKind({ methodType: "card", preset: "binance_pay", code: "crypto" })).toBe("card");
    expect(paymentIconKind({ methodType: "wise", code: "crypto" })).toBe("transfer");
  });

  it("then the top-up method of the preset (the catalog of plan 32 §3)", () => {
    for (const preset of ["bank_transfer", "vodafone_cash", "fawry_transfer", "instapay"])
      expect(paymentIconKind({ preset }), preset).toBe("bank");
    for (const preset of ["crypto_transfer", "binance_pay", "nowpayments", "binance_pay_auto"])
      expect(paymentIconKind({ preset }), preset).toBe("crypto");
  });

  it("then the words of the code, then a card", () => {
    expect(paymentIconKind({ code: "crypto" })).toBe("crypto");
    expect(paymentIconKind({ code: "USDT-TRC20" })).toBe("crypto");
    expect(paymentIconKind({ code: "btc" })).toBe("crypto");
    expect(paymentIconKind({ code: "bank_eg" })).toBe("bank");
    expect(paymentIconKind({ code: "stripe" })).toBe("card");
    expect(paymentIconKind({ preset: "something_new", code: "x" })).toBe("card");
    expect(paymentIconKind({})).toBe("card");
  });
});
