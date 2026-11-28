import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { auth } from "@/lib/i18n/messages/auth";
import { errors } from "@/lib/i18n/messages/errors";
import { EMPTY_DETAILS } from "./sign-up-fields";
import { SignUpFields, SignUpForm, SignUpSent, type SignUpFormText } from "./sign-up-form";

const text: SignUpFormText = {
  fields: auth.fields,
  shared: auth.shared,
  signUp: { form: auth.signUp.form, errors: auth.signUp.errors },
};
const countries = [
  { code: "JO", name: "Jordan" },
  { code: "US", name: "United States" },
];
const noop = () => {};

const draw = (node: React.ReactNode) => renderToStaticMarkup(<ErrorTextProvider messages={errors}>{node}</ErrorTextProvider>);
/** The opening tag of the control with this `name`. */
const control = (html: string, name: string) =>
  name === "country"
    ? // The country's control is the button a person uses; the select beside it is hidden and only carries the value.
      (/<button[^>]*role="combobox"[^>]*>/.exec(html)?.[0] ?? "")
    : (new RegExp(`<(?:input|select)[^>]*name="${name}"[^>]*>`).exec(html)?.[0] ?? "");

describe("the sign-up form", () => {
  const html = draw(<SignUpForm countries={countries} t={text} />);

  it("asks for the six details, in this order, all required", () => {
    const names = ["firstName", "lastName", "email", "country", "phone", "password"];
    const positions = names.map((name) => html.indexOf(`name="${name}"`));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    for (const name of names) expect(control(html, name), name).toContain("required");
    expect(html).toContain("First name");
    expect(html).toContain("Last name");
    expect(html).toContain("Email address");
    expect(html).toContain("Phone number");
    expect(html).toContain(">Country");
    expect(html).toContain(">Password");
  });

  it("gives every control its autocomplete hint", () => {
    expect(control(html, "firstName")).toContain('autoComplete="given-name"');
    expect(control(html, "lastName")).toContain('autoComplete="family-name"');
    expect(control(html, "email")).toContain('autoComplete="email"');
    expect(control(html, "phone")).toContain('autoComplete="tel"');
    expect(html).toContain('<select name="country" autoComplete="country"');
    expect(control(html, "password")).toContain('autoComplete="new-password"');
  });

  it("offers only the countries it was given, by name with the code as the value, after a prompt", () => {
    expect(html).toContain("Select your country");
    expect(html).toContain('<option value="JO">Jordan</option>');
    expect(html).toContain('<option value="US">United States</option>');
    expect(html).not.toContain('value="FR"');
  });

  it("shows the password rules text, the show/hide control, the anti-bot box and the submit button", () => {
    expect(html).toContain(auth.fields.passwordRules);
    expect(html).toContain('aria-label="Show password"');
    expect(html).toContain("min-height:65px");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>(?:(?!<\/button>)[\s\S])*Create account/);
  });

  it("limits the names to 60 characters in the box too, and checks in code rather than with the browser's popups", () => {
    expect(control(html, "firstName")).toContain('maxLength="60"');
    expect(control(html, "lastName")).toContain('maxLength="60"');
    expect(html).toMatch(/<form [^>]*noValidate=""/);
  });

  it("is a post form whose submit button is disabled in the server's HTML: nothing can go to the address before the script loads", () => {
    expect(html).toMatch(/<form [^>]*method="post"/);
    expect(/<button[^>]*type="submit"[^>]*>/.exec(html)?.[0]).toContain('disabled=""');
  });

  it("has no old email-only wording", () => {
    expect(html).not.toContain("Email me a sign-in link");
    expect(html).not.toContain("creates your account");
  });
});

describe("the fields with errors: each sentence sits under its own field, which is marked invalid", () => {
  const values = { ...EMPTY_DETAILS };
  const problems = {
    firstName: "Enter 1 to 60 characters.",
    lastName: "Enter 1 to 60 characters.",
    email: "Enter a valid email address.",
    phone: "Enter a phone number with 7 to 15 digits. A leading + is allowed.",
    country: "Choose your country from the list.",
    password: "Use 10 to 128 characters.",
  };
  const html = draw(<SignUpFields values={values} password="" onChange={noop} errors={problems} countries={countries} t={text} />);

  it("marks every field with an error invalid and describes it by its error", () => {
    for (const name of Object.keys(problems)) {
      const tag = control(html, name);
      expect(tag, name).toContain('aria-invalid="true"');
      expect(tag, name).toMatch(/aria-describedby="[^"]*-error/);
    }
  });

  it("writes each sentence in the error line of its own field", () => {
    for (const [name, sentence] of Object.entries(problems)) {
      const field = html.slice(html.indexOf(`name="${name}"`));
      const nextField = field.indexOf("</p></div></div>");
      const own = field.slice(0, nextField > -1 ? nextField + 16 : undefined);
      expect(own, name).toContain(sentence);
    }
    expect(html.match(/text-danger-ink">Enter 1 to 60 characters\./g)).toHaveLength(2);
  });

  it("marks nothing when there is no error", () => {
    const clean = draw(<SignUpFields values={values} password="" onChange={noop} errors={{}} countries={countries} t={text} />);
    expect(clean).not.toContain('aria-invalid="true"');
  });

  it("keeps what was typed", () => {
    const filled = draw(
      <SignUpFields
        values={{ firstName: "Sam", lastName: "Hamdan", email: "sam@example.com", phone: "+962 79 123 4567", country: "US" }}
        password="Orchard-Lantern-8841"
        onChange={noop}
        errors={{}}
        countries={countries}
        t={text}
      />,
    );
    expect(control(filled, "firstName")).toContain('value="Sam"');
    expect(control(filled, "email")).toContain('value="sam@example.com"');
    expect(control(filled, "phone")).toContain('value="+962 79 123 4567"');
    expect(filled).toContain('<option value="US" selected="">United States</option>');
  });
});

describe("the state after the form was sent", () => {
  const html = draw(<SignUpSent email="sam@example.com" t={text} onBack={noop} />);

  it("is the neutral check-your-email text with the address, and says nothing about whether the address has an account", () => {
    expect(html).toContain("Check your email");
    expect(html).toContain("If that address can sign in, a link is on its way to sam@example.com.");
    expect(html).toContain('role="status"');
    expect(html).not.toMatch(/already (has|have) an account|no account|new account/i);
  });

  it("tells the person to open the link on this device to finish at once, and that another device asks to confirm the details", () => {
    expect(html).toContain("Open the link on this device to finish at once. On another device you will be asked to confirm your details.");
  });

  it("has the way back to the form and no form fields", () => {
    expect(html).toContain("Use a different email");
    expect(html).not.toContain("<input");
    expect(html).not.toContain('name="password"');
  });
});
