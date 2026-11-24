import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { auth } from "@/lib/i18n/messages/auth";
import { errors } from "@/lib/i18n/messages/errors";
import { ForgotPasswordForm } from "./forgot-password-form";

const html = renderToStaticMarkup(
  <ErrorTextProvider messages={errors}>
    <ForgotPasswordForm t={{ fields: auth.fields, shared: auth.shared, forgot: auth.forgot }} />
  </ErrorTextProvider>,
);

describe("the forgot-password form", () => {
  it("is an email field and a submit, with the anti-bot box the request needs", () => {
    expect(html).toContain('name="email"');
    expect(html).toContain("Email me a reset link");
    expect(html).toContain("min-height:65px"); // the Turnstile box (components/turnstile.tsx)
  });

  it("has no account-type control and no query-string switch", () => {
    expect(html).not.toMatch(/type="radio"|role="radio"|role="radiogroup"/);
    expect(html).not.toContain("Account type");
    expect(html).not.toMatch(/Customer|Merchant/);
    expect(html).not.toMatch(/[?&]as=/);
  });

  it("links back to the one sign-in page", () => {
    expect(html).toContain('href="/en/sign-in"');
  });
});
