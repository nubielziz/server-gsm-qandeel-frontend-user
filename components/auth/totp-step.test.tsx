import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { auth } from "@/lib/i18n/messages/auth";
import { errors } from "@/lib/i18n/messages/errors";
import { TotpStep } from "./totp-step";

const noop = () => {};
const html = renderToStaticMarkup(
  <ErrorTextProvider messages={errors}>
    <TotpStep
      t={{ fields: auth.fields, shared: auth.shared, signIn: auth.signIn }}
      onDone={noop}
      onExpired={noop}
      onBack={noop}
    />
  </ErrorTextProvider>,
);

describe("the code step", () => {
  it("asks for the 6-digit code the way a one-time code is asked for", () => {
    expect(html).toContain("Two-step verification");
    const input = /<input[^>]*name="code"[^>]*>/.exec(html)?.[0] ?? "";
    expect(input).toContain('inputMode="numeric"');
    expect(input).toContain('autoComplete="one-time-code"');
    expect(input).toContain('maxLength="6"');
  });

  it("has the submit and a way back to the form", () => {
    expect(html).toContain("Verify and sign in");
    expect(html).toContain("Back to sign in");
  });
});
