// The phone box as the server draws it: one tel input, and the button that shows the flag of the number's country.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PhoneInput, type PhoneInputProps } from "./phone-input";

const draw = (over: Partial<PhoneInputProps> = {}) =>
  renderToStaticMarkup(<PhoneInput name="phone" label="Phone number" value="" onValueChange={() => {}} {...over} />);
const input = (html: string) => /<input[^>]*>/.exec(html)?.[0] ?? "";
const button = (html: string) => /<button[^>]*>/.exec(html)?.[0] ?? "";

describe("PhoneInput", () => {
  it("is one left-to-right tel box with the field's name, the label pointing at it, and the tel autofill hint", () => {
    const html = draw({ value: "+962 79 123 4567", maxLength: 40 });
    const id = /id="([^"]+)"/.exec(input(html))?.[1];
    expect(html).toContain(`<label for="${id}"`);
    expect(input(html)).toContain('type="tel"');
    expect(input(html)).toContain('name="phone"');
    expect(input(html)).toContain('dir="ltr"');
    expect(input(html)).toContain('autoComplete="tel"');
    expect(input(html)).toContain('maxLength="40"');
    expect(input(html)).toContain('value="+962 79 123 4567"');
    expect(html.match(/<input/g)).toHaveLength(1);
  });

  it("shows the flag of the number's country, and says its calling code in the button's name", () => {
    const html = draw({ value: "+962 79 123 4567" });
    expect(html).toContain("/flags/jo.svg");
    expect(button(html)).toContain('aria-label="Country calling code: +962"');
    expect(button(html)).toContain('aria-haspopup="listbox"');
  });

  it("shows a globe, not a flag, for an empty box and for a local number", () => {
    for (const value of ["", "0791234567"]) {
      const html = draw({ value });
      expect(html, value).not.toContain("/flags/");
      expect(html, value).toContain("lucide-globe");
      expect(button(html), value).toContain('aria-label="Country calling code"');
    }
  });

  it("lets the form's country decide between the countries of a shared calling code", () => {
    expect(draw({ value: "+1 ", countryHint: "CA" })).toContain("/flags/ca.svg");
    expect(draw({ value: "+1 " })).toContain("/flags/us.svg");
    // The number itself wins as soon as it can tell.
    expect(draw({ value: "+1 242 555 0100", countryHint: "CA" })).toContain("/flags/bs.svg");
  });

  it("never rewrites what was typed: Arabic-Indic digits stay in the box and still find their country", () => {
    const typed = "+\u0669\u0666\u0662 \u0667\u0669";
    const html = draw({ value: typed });
    expect(input(html)).toContain(`value="${typed}"`);
    expect(html).toContain("/flags/jo.svg");
  });

  it("marks the box with its error and keeps the list out of the server HTML", () => {
    const html = draw({ error: "Enter a phone number with 7 to 15 digits.", required: true });
    expect(input(html)).toContain('aria-invalid="true"');
    expect(input(html)).toContain('required=""');
    expect(html).not.toContain('role="option"');
  });
});
