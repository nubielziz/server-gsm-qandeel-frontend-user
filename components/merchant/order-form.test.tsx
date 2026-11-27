// The order form of a merchant rank (decisions 007 and 008): it draws only what the service lists, each field by its own type and
// Required tick, whatever the type of the service. A field of type `imei` is a numeric box with a live hint; a service with no
// fields asks nothing. There is no switch between one IMEI and several, no IMEI list, and the total is the price times the quantity.
// (The send, the errors and the idempotency key are the browser's: e2e/merchant*.spec.ts.)
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

/** A field of type `imei`: the API names its key and label, the form hard-codes neither. */
const IMEI_FIELD: Field = { key: "imei_number", label: "Device IMEI", fieldType: "imei", required: true, isMainInput: true, options: [], regex: "" };
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

describe("OrderForm: every field is drawn by its own type (decision 008)", () => {
  it("draws a field of type imei, with its own label, as a one-line numeric box with the IMEI hint", () => {
    const html = render();
    const box = inputOf(html, "inputs.imei_number");
    expect(box).toContain('inputMode="numeric"');
    expect(box).toContain('autoComplete="off"');
    expect(box).toContain('dir="ltr"');
    expect(box).toContain('maxLength="24"');
    expect(box).toContain("required");
    expect(html).toContain("Device IMEI");
    expect(html).toContain(merchant.form.imeiHint);
  });

  it("an imei field follows its own Required tick", () => {
    const html = render({ fields: [{ ...IMEI_FIELD, required: false }] });
    expect(inputOf(html, "inputs.imei_number")).not.toContain("required");
    expect(html).toContain(merchant.form.optional);
  });

  it("draws the field flagged isMainInput by its own type: a text field stays a plain text box, required or not", () => {
    const text: Field = { ...IMEI_FIELD, fieldType: "text", required: false };
    const html = render({ fields: [text] });
    const box = inputOf(html, "inputs.imei_number");
    expect(box).not.toContain("inputMode");
    expect(box).not.toContain("required");
    expect(html).not.toContain(merchant.form.imeiHint);
    expect(html).toContain(merchant.form.optional);
  });

  it("draws the field flagged isMainInput by its own type, whatever that type is: a select, a textarea, a number box", () => {
    const flagged = (fieldType: Field["fieldType"], options: string[] = []): Field => ({ ...IMEI_FIELD, fieldType, options });

    const select = render({ fields: [flagged("select", ["Model A", "Model B"])] });
    expect(select).toMatch(/<select[^>]*name="inputs.imei_number"/);
    expect(select).toContain('<option value="Model A"');
    expect(select).toContain('<option value="Model B"');
    expect(inputOf(select, "inputs.imei_number")).toBe("");

    const textarea = render({ fields: [flagged("textarea")] });
    expect(textarea).toMatch(/<textarea[^>]*name="inputs.imei_number"/);
    expect(inputOf(textarea, "inputs.imei_number")).toBe("");

    const number = render({ fields: [flagged("number")] });
    expect(inputOf(number, "inputs.imei_number")).toContain('inputMode="decimal"');
    expect(inputOf(number, "inputs.imei_number")).not.toContain('inputMode="numeric"');

    for (const html of [select, textarea, number]) expect(html).not.toContain(merchant.form.imeiHint);
  });

  it("draws a field of type imei on a service of any type, and a plain field on an IMEI service", () => {
    const server = render({ type: "server", fields: [IMEI_FIELD] });
    expect(inputOf(server, "inputs.imei_number")).toContain('inputMode="numeric"');
    const imei = render({ type: "imei", fields: [ACCOUNT_FIELD] });
    expect(inputOf(imei, "inputs.account")).not.toContain("inputMode");
    expect(imei).not.toContain(merchant.form.imeiHint);
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

  it("a service with no fields asks nothing, whatever its type, and its button is on", () => {
    for (const type of ["imei", "server"] as const) {
      const html = render({ type, fields: [] });
      expect(html).toContain(merchant.form.noInputs);
      expect(html).not.toContain("can&#x27;t be ordered right now");
      expect(html).not.toContain("Contact support");
      expect(html).not.toContain("order-unorderable");
      expect(html).not.toMatch(/<button type="submit"[^>]*\sdisabled=""/);
    }
  });
});

// ── The ten checked types of decision 009: each is drawn by the shared table with its own control, keyboard hints and hint line.
describe("OrderForm: the ten checked field types are drawn by their own control (decision 009)", () => {
  const typed = (fieldType: string, over: Partial<Field> = {}): Field => ({
    key: "code_box",
    label: "Device code",
    fieldType,
    required: true,
    isMainInput: false,
    options: [],
    regex: "",
    ...over,
  });
  const hints = merchant.form.types.hints;

  it("draws every one of the ten with its label, its hint under the box and the field's own name", () => {
    for (const type of ["imei_bulk", "imeisv", "serial", "iccid", "eid", "meid", "ecid", "mac_address", "mi_lock_code", "box_sn"] as const) {
      const html = render({ fields: [typed(type)] });
      expect(html, type).toContain("Device code");
      expect(html, type).toContain(hints[type]);
      expect(html, type).toMatch(new RegExp(`<(input|textarea)[^>]*name="inputs.code_box"`));
      expect(html, type).not.toContain(merchant.form.imeiHint);
    }
  });

  it("draws the digit types as a one-line numeric box with no spell check, read left to right", () => {
    const expected = { imeisv: 24, iccid: 32, eid: 48 } as const;
    for (const [type, maxLength] of Object.entries(expected)) {
      const box = inputOf(render({ fields: [typed(type)] }), "inputs.code_box");
      expect(box, type).toContain('inputMode="numeric"');
      expect(box, type).toContain('autoCapitalize="off"');
      expect(box, type).toContain('autoComplete="off"');
      expect(box, type).toContain('spellCheck="false"');
      expect(box, type).toContain('dir="ltr"');
      expect(box, type).toContain(`maxLength="${maxLength}"`);
      expect(box, type).toContain("required");
    }
  });

  it("starts the keyboard in capitals for the codes that are stored in capitals, and not for the Mi lock code", () => {
    for (const type of ["serial", "meid", "ecid", "mac_address", "box_sn"]) {
      expect(inputOf(render({ fields: [typed(type)] }), "inputs.code_box"), type).toContain('autoCapitalize="characters"');
    }
    expect(inputOf(render({ fields: [typed("mi_lock_code")] }), "inputs.code_box")).toContain('autoCapitalize="off"');
  });

  it("draws a list of IMEIs as a text area of six rows with the hint 'One IMEI per line, up to 30.', and no other quantity", () => {
    const html = render({ fields: [typed("imei_bulk")] });
    const area = /<textarea[^>]*name="inputs.code_box"[^>]*>/.exec(html)?.[0] ?? "";
    expect(area).toContain('rows="6"');
    expect(area).toContain('dir="ltr"');
    expect(area).toContain('spellCheck="false"');
    expect(area).toContain('maxLength="1000"');
    expect(area).toContain("required");
    expect(inputOf(html, "inputs.code_box")).toBe("");
    expect(html).toContain("One IMEI per line, up to 30.");
    // One order at one price: no quantity control, no per-IMEI orders.
    expect(html).not.toContain('name="quantity"');
    expect(html).not.toContain('name="imeis"');
  });

  it("follows the field's own Required tick", () => {
    const optional = render({ fields: [typed("box_sn", { required: false })] });
    expect(inputOf(optional, "inputs.code_box")).not.toContain("required");
    expect(optional).toContain(merchant.form.optional);
  });

  it("draws a type this code does not know as a plain text field, as decision 008 says", () => {
    const html = render({ fields: [typed("future_type")] });
    const box = inputOf(html, "inputs.code_box");
    expect(box).not.toContain("inputMode");
    expect(box).not.toContain("autoCapitalize");
    expect(html).toContain("Device code");
    for (const hint of Object.values(hints)) expect(html).not.toContain(hint);
  });
});
