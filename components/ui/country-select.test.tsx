// The country field as the server draws it: the button a person uses, and the hidden select that carries the value.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CountrySelect, type CountrySelectProps } from "./country-select";

const countries = [
  { code: "JO", name: "Jordan" },
  { code: "US", name: "United States" },
];
const draw = (over: Partial<CountrySelectProps> = {}) =>
  renderToStaticMarkup(
    <CountrySelect name="country" label="Country" placeholder="Select your country" value="" onValueChange={() => {}} countries={countries} {...over} />,
  );
const button = (html: string) => /<button[^>]*role="combobox"[^>]*>/.exec(html)?.[0] ?? "";
const select = (html: string) => /<select[^>]*>/.exec(html)?.[0] ?? "";

describe("CountrySelect", () => {
  it("is a button the label points at, closed, that says the prompt while no country is chosen", () => {
    const html = draw();
    const id = /id="([^"]+)"/.exec(button(html))?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`<label for="${id}"`);
    expect(button(html)).toContain('aria-haspopup="listbox"');
    expect(button(html)).toContain('aria-expanded="false"');
    expect(html).toMatch(/<button[^>]*role="combobox"[^>]*>[\s\S]*?Select your country[\s\S]*?<\/button>/);
    expect(html).not.toContain("/flags/");
  });

  it("shows the chosen country by its name with its flag", () => {
    const html = draw({ value: "JO" });
    expect(html).toMatch(/<button[^>]*role="combobox"[^>]*>[\s\S]*?\/flags\/jo\.svg[\s\S]*?Jordan[\s\S]*?<\/button>/);
    // The flag only decorates the name next to it.
    expect(/<img[^>]*>/.exec(html)?.[0]).toContain('alt=""');
  });

  it("keeps a native select for the value, the options and the autofill, hidden from sight and from assistive technology", () => {
    const html = draw({ value: "US" });
    expect(select(html)).toContain('name="country"');
    expect(select(html)).toContain('autoComplete="country"');
    expect(select(html)).toContain('aria-hidden="true"');
    expect(select(html)).toContain('tabindex="-1"');
    expect(select(html)).toContain('class="sr-only"');
    expect(html).toContain('<option value="JO">Jordan</option>');
    expect(html).toContain('<option value="US" selected="">United States</option>');
  });

  it("does not put the list in the server HTML: it is drawn when the panel opens", () => {
    const html = draw({ value: "JO" });
    expect(html).not.toContain('role="option"');
    expect(html).not.toContain('role="listbox"');
    expect(html).toMatch(/<div[^>]*popover="auto"[^>]*><\/div>/);
  });

  it("marks the button, not the hidden select, when the field has an error or is required", () => {
    const html = draw({ error: "Choose your country from the list.", required: true });
    expect(button(html)).toContain('aria-invalid="true"');
    expect(button(html)).toContain('aria-required="true"');
    expect(button(html)).toMatch(/aria-describedby="[^"]*-error"/);
    expect(select(html)).not.toContain("aria-invalid");
    expect(select(html)).not.toContain("required");
    expect(html).toContain("Choose your country from the list.");
  });

  it("offers no empty choice once a country is saved and no prompt is given", () => {
    const html = draw({ value: "JO", placeholder: undefined });
    expect(html).not.toContain('<option value=""');
  });

  it("still shows a saved country the list no longer offers, by its code", () => {
    const html = draw({ value: "FR" });
    expect(html).toContain('<option value="FR" selected="">FR</option>');
    expect(html).toMatch(/<button[^>]*role="combobox"[^>]*>[\s\S]*?\/flags\/fr\.svg[\s\S]*?FR[\s\S]*?<\/button>/);
  });

  it("does not open before the script has loaded (the button names no panel in the server HTML)", () => {
    expect(button(draw())).not.toContain("popovertarget");
  });
});
