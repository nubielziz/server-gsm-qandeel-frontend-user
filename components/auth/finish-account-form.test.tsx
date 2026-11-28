import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { auth } from "@/lib/i18n/messages/auth";
import { errors } from "@/lib/i18n/messages/errors";
import { FinishAccountForm, type FinishAccountFormProps } from "./finish-account-form";

const noop = () => {};
const countries = [
  { code: "JO", name: "Jordan" },
  { code: "US", name: "United States" },
];
const pending = { firstName: "Sam", lastName: "Hamdan", country: "JO", phone: "+962791234567" };
const t: FinishAccountFormProps["t"] = {
  fields: auth.fields,
  errors: auth.signUp.errors,
  finish: auth.signIn.finish,
  continue: auth.signIn.link.continue,
};

const draw = (over: Partial<FinishAccountFormProps> = {}) =>
  renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <FinishAccountForm pending={pending} countries={countries} t={t} onDone={noop} {...over} />
    </ErrorTextProvider>,
  );
/** The opening tag of the control with this `name`. */
const control = (html: string, name: string) =>
  name === "country"
    ? // The country's control is the button a person uses; the select beside it is hidden and only carries the value.
      (/<button[^>]*role="combobox"[^>]*>/.exec(html)?.[0] ?? "")
    : (new RegExp(`<(?:input|select)[^>]*name="${name}"[^>]*>`).exec(html)?.[0] ?? "");

describe("the finish-your-account form", () => {
  const html = draw();

  it("has the heading, then the one line that asks the person to check the details, above the fields", () => {
    expect(html).toContain("Finish creating your account");
    expect(html).toContain("Check these details. If they are not yours, change them.");
    expect(html.indexOf("Check these details.")).toBeLessThan(html.indexOf('name="firstName"'));
  });

  it("shows the four details the server kept, editable, and asks for no email", () => {
    expect(control(html, "firstName")).toContain('value="Sam"');
    expect(control(html, "lastName")).toContain('value="Hamdan"');
    expect(control(html, "phone")).toContain('value="+962791234567"');
    expect(html).toContain('<option value="JO" selected="">Jordan</option>');
    for (const name of ["firstName", "lastName", "phone", "country", "password"]) {
      expect(control(html, name), name).toContain("required");
      expect(control(html, name), name).not.toContain("readOnly");
    }
    expect(html).not.toContain('name="email"');
    expect(html).not.toContain('type="email"');
  });

  it("gives every control its autocomplete hint, the password a new-password one", () => {
    expect(control(html, "firstName")).toContain('autoComplete="given-name"');
    expect(control(html, "lastName")).toContain('autoComplete="family-name"');
    expect(control(html, "phone")).toContain('autoComplete="tel"');
    expect(html).toContain('<select name="country" autoComplete="country"');
    expect(control(html, "password")).toContain('autoComplete="new-password"');
  });

  it("has an EMPTY password box with the usual rules and the show/hide control", () => {
    expect(control(html, "password")).toContain('value=""');
    expect(control(html, "password")).not.toMatch(/value="[^"]/);
    expect(html).toContain(auth.fields.passwordRules);
    expect(html).toContain('aria-label="Show password"');
  });

  it("offers only the countries it was given", () => {
    expect(html).toContain('<option value="US">United States</option>');
    expect(html).not.toContain('value="FR"');
  });

  it("leaves the country on its prompt when the menu no longer offers the server's one", () => {
    const other = draw({ pending: { ...pending, country: "FR" } });
    expect(other).toContain('<option value="" disabled="" selected="">Select your country</option>');
    expect(other).not.toContain('<option value="JO" selected=""');
    expect(other).not.toContain('<option value="US" selected=""');
  });

  it("has the submit button and no anti-bot box (the route is for the signed-in account), and never shows the password anywhere", () => {
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>(?:(?!<\/button>)[\s\S])*Finish creating account/);
    expect(html).not.toContain("min-height:65px");
    expect(html).not.toContain("Orchard");
  });
});
