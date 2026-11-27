// The control the two order forms share for a field of a checked type (decision 009): the hint under the box and, for a list of IMEIs,
// the live count of what was typed so far.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fieldTypes } from "@/lib/i18n/messages/field-types";
import { TypedField, type TypedFieldProps } from "./typed-field";

const render = (over: Partial<TypedFieldProps> = {}) =>
  renderToStaticMarkup(
    <TypedField type="imei_bulk" labels={fieldTypes} name="list" label="IMEIs" required={false} value="" onChange={() => {}} {...over} />,
  );

describe("TypedField", () => {
  it("shows the hint of the type and no count while a list is empty", () => {
    const html = render();
    expect(html).toContain("One IMEI per line, up to 30.");
    expect(html).not.toMatch(/\d+ IMEIs?/);
  });

  it("shows the live count of a list: one, then several, empty items not counted", () => {
    expect(render({ value: "490154203237518" })).toContain("1 IMEI<");
    expect(render({ value: "490154203237518\n\n356938035643809, 352099001761481" })).toContain("3 IMEIs<");
  });

  it("turns the count to the danger colour above thirty", () => {
    const html = render({ value: Array.from({ length: 31 }, (_, n) => String(n + 1)).join("\n") });
    expect(html).toContain("31 IMEIs");
    expect(html).toContain("text-danger-ink");
    expect(render({ value: "1\n2" })).not.toContain("text-danger-ink");
  });

  it("shows no count for a one-line type, and the error under the box", () => {
    const html = render({ type: "serial", value: "AB", error: "This serial number is not valid: 5 to 30 letters and digits." });
    expect(html).toContain(fieldTypes.hints.serial);
    expect(html).not.toMatch(/\d+ IMEIs?/);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("This serial number is not valid: 5 to 30 letters and digits.");
  });
});
