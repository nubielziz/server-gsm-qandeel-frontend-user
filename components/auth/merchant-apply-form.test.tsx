import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { auth } from "@/lib/i18n/messages/auth";
import { errors } from "@/lib/i18n/messages/errors";
import { MerchantApplyForm } from "./merchant-apply-form";

const en = auth.becomeMerchant;

describe("the merchant application form", () => {
  const countries = [
    { code: "JO", name: "Jordan" },
    { code: "US", name: "United States" },
  ];
  const html = renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <MerchantApplyForm
        digits="12025550100"
        display="+12025550100"
        countries={countries}
        t={{ fields: auth.fields, errors: auth.signUp.errors, becomeMerchant: en }}
      />
    </ErrorTextProvider>,
  );

  it("asks for first name, last name, email, phone and country, all required, and for no password", () => {
    for (const name of ["firstName", "lastName", "email", "phone", "country"]) {
      expect(html, name).toMatch(new RegExp(`<(?:input|select)[^>]*required=""[^>]*name="${name}"`));
    }
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('name="password"');
    expect(html).toContain('autoComplete="given-name"');
    expect(html).toContain('autoComplete="tel"');
  });

  it("offers the countries it was given, and ends with the WhatsApp button, the number and the note that nothing is kept", () => {
    expect(html).toContain('<option value="JO">Jordan</option>');
    expect(html).toContain(en.detailsNote);
    expect(html.indexOf(en.detailsNote)).toBeLessThan(html.indexOf("Chat on WhatsApp"));
    expect(html).toContain("+12025550100");
  });

  it("sends nothing to the API: no Turnstile box and no action", () => {
    expect(html).not.toContain("min-height:65px");
    expect(html).not.toMatch(/<form[^>]*action=/);
  });

  it("is a post form with a disabled button until the script has loaded: the details never reach the address", () => {
    expect(html).toMatch(/<form [^>]*method="post"/);
    expect(/<button[^>]*type="submit"[^>]*>/.exec(html)?.[0]).toContain('disabled=""');
  });
});
