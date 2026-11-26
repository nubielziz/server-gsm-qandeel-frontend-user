// The order form of a merchant rank (decision 007): it draws only what the service lists. The IMEI of an IMEI service is the
// field the API flags `isMainInput`, whatever its key and label: a numeric box, drawn in the service's own order like every other field. There is no switch between
// one IMEI and several, no IMEI list, and the total is the price times the quantity. An IMEI service with no such field says
// it cannot be ordered and its button is off. (The send, the errors and the idempotency key are the browser's: e2e/merchant*.spec.ts.)
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {}, replace() {} }) }));

import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { common } from "@/lib/i18n/messages/common";
import { errors } from "@/lib/i18n/messages/errors";
import { merchant } from "@/lib/i18n/messages/merchant";
import { orderFormHrefs } from "@/lib/merchant/order-input";
import { OrderForm, type OrderFormProps } from "./order-form";

type Field = OrderFormProps["service"]["fields"][number];

/** The box of the IMEI: the API names its key and label, the form hard-codes neither. */
const IMEI_FIELD: Field = { key: "imei_number", label: "Device IMEI", fieldType: "text", required: true, isMainInput: true, options: [], regex: "" };
const ACCOUNT_FIELD: Field = { key: "account", label: "Z3X account", fieldType: "text", required: true, isMainInput: false, options: [], regex: "" };

const props = (over: Partial<OrderFormProps["service"]>): OrderFormProps => ({
  service: { id: 42, name: "iCloud Clean", type: "imei", price: "3.2000", currency: "USD", minQty: 1, maxQty: 1, qtyOptions: [], fields: [IMEI_FIELD], ...over },
  available: "15.0000",
  hrefs: orderFormHrefs(),
  labels: { form: merchant.form, summary: merchant.summary, errors: merchant.orderErrors, placed: merchant.placed, quantity: common.quantity },
  intro: null,
});

const render = (over: Partial<OrderFormProps["service"]> = {}) =>
  renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <OrderForm {...props(over)} />
    </ErrorTextProvider>,
  );

/** The `<input>` tag of a field, by its name. */
const inputOf = (html: string, name: string) => new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(html)?.[0] ?? "";

describe("OrderForm: the IMEI is a field of the service", () => {
  it("draws the field the API flags isMainInput, with its own label, as a required numeric box", () => {
    const html = render();
    const box = inputOf(html, "inputs.imei_number");
    expect(box).toContain('inputMode="numeric"');
    expect(box).toContain("required");
    expect(html).toContain("Device IMEI");
    expect(html).toContain(merchant.form.imeiHint);
  });

  it("has no switch between one IMEI and several, no IMEI list and no box of its own for the IMEI", () => {
    const html = render({ fields: [IMEI_FIELD, ACCOUNT_FIELD] });
    for (const gone of ["How many IMEIs?", "One IMEI", "Several IMEIs", "IMEI list", "IMEIs ready", "to fix"]) expect(html, gone).not.toContain(gone);
    expect(html).not.toContain('name="imei"');
    expect(html).not.toContain('name="imeis"');
    expect(html).not.toContain("radiogroup");
    expect(html).not.toContain("<textarea");
  });

  it("draws the quantity first and then every field in the service's own order, the IMEI's where the service puts it", () => {
    const at = (html: string, needle: string) => html.indexOf(needle);
    const imeiLast = render({ minQty: 2, maxQty: 50, fields: [ACCOUNT_FIELD, IMEI_FIELD] });
    expect(at(imeiLast, 'name="quantity"')).toBeGreaterThan(-1);
    expect(at(imeiLast, 'name="quantity"')).toBeLessThan(at(imeiLast, 'name="inputs.account"'));
    expect(at(imeiLast, 'name="inputs.account"')).toBeLessThan(at(imeiLast, 'name="inputs.imei_number"'));
    const imeiFirst = render({ minQty: 2, maxQty: 50, fields: [IMEI_FIELD, ACCOUNT_FIELD] });
    expect(at(imeiFirst, 'name="quantity"')).toBeLessThan(at(imeiFirst, 'name="inputs.imei_number"'));
    expect(at(imeiFirst, 'name="inputs.imei_number"')).toBeLessThan(at(imeiFirst, 'name="inputs.account"'));
  });

  it("totals the price times the quantity, and has no row for a count of IMEIs", () => {
    const html = render({ minQty: 2, maxQty: 50 });
    expect(html).toContain("$6.40"); // 2 × $3.20, the quantity a range starts from
    expect(html).not.toContain(">IMEIs<");
    expect(render()).toContain("$3.20");
  });

  it("an IMEI service with no field for its IMEI says it cannot be ordered, with the way to support, and its button is off and points at the notice", () => {
    for (const fields of [[], [ACCOUNT_FIELD]]) {
      const html = render({ fields });
      expect(html).toContain("This service can&#x27;t be ordered right now. Please contact support.");
      expect(html).toContain('href="/en/support">Contact support</a>');
      expect(html).toMatch(/<button type="submit"[^>]*\sdisabled=""/);
      expect(html).toMatch(/<button type="submit"[^>]*aria-describedby="order-unorderable"/);
      expect(html).toMatch(/<div id="order-unorderable"[^>]*role="alert"|<div role="alert"[^>]*id="order-unorderable"/);
      expect(html).not.toContain(merchant.form.noInputs);
    }
  });

  it("a service that is not an IMEI service needs no IMEI field and says nothing about one", () => {
    const html = render({ type: "server", fields: [] });
    expect(html).not.toContain("can&#x27;t be ordered right now");
    expect(html).toContain(merchant.form.noInputs);
    expect(html).not.toMatch(/<button type="submit"[^>]*\sdisabled=""/);
    expect(html).not.toContain("order-unorderable");
  });
});
