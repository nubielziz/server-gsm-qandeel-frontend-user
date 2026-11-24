// The Add funds page of a merchant rank: what shows for each answer of the API.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The forms and the retry button read the router; the forms read the error texts from the layout's provider.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
vi.mock("@/lib/payment-logo-sizes.json", () => ({ default: {} }));

import { ApiError } from "@/lib/api/errors";
import type { PaymentMethod } from "@/lib/api/types";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { errors } from "@/lib/i18n/messages/errors";
import { MerchantAddFundsBody } from "./merchant-add-funds";

const wrap = (node: React.ReactElement) => renderToStaticMarkup(<ErrorTextProvider messages={errors}>{node}</ErrorTextProvider>);

const merchantMethod = (id: number, over: Partial<PaymentMethod> = {}): PaymentMethod => ({
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
  ...over,
});

describe("Add funds of a merchant rank", () => {
  it("shows the invoice form with a radio per method", () => {
    const html = wrap(
      <MerchantAddFundsBody methods={{ ok: true, data: [merchantMethod(1), merchantMethod(2, { kind: "automatic" })] }} />,
    );
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain("Continue");
  });

  it("says when no method is set up, with a way to ask for help", () => {
    const html = wrap(<MerchantAddFundsBody methods={{ ok: true, data: [] }} />);
    expect(html).toContain("No payment methods are available");
    expect(html).toContain('href="/en/help"');
  });

  it("says why the methods could not be read, with the request reference", () => {
    const methods = { ok: false as const, error: new ApiError({ status: 500, code: "INTERNAL_ERROR", requestId: "req-6602" }) };
    const html = wrap(<MerchantAddFundsBody methods={methods} />);
    expect(html).toContain("We could not load the payment methods");
    expect(html).toContain("req-6602");
  });
});
