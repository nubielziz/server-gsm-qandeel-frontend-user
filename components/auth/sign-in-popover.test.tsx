// The header's sign-in button and its panel, and the steps as the panel draws them.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(""),
}));

import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { auth } from "@/lib/i18n/messages/auth";
import { errors } from "@/lib/i18n/messages/errors";
import { SignInSteps } from "./sign-in-flow";
import { SignInPopover } from "./sign-in-popover";
import { signInStepsText } from "./sign-in-steps-text";

const t = signInStepsText(auth);

describe("signInStepsText", () => {
  it("carries the texts of the steps and nothing of the mailed link's landing or of the sign-up form", () => {
    const words = JSON.stringify(t);
    expect(words).toContain("Email me a sign-in link");
    expect(words).toContain("Two-step verification");
    expect(words).not.toContain(auth.signIn.link.title);
    expect(words).not.toContain(auth.signIn.finish.title);
    expect(words).not.toContain(auth.fields.firstName);
    expect(words).not.toContain(auth.fields.countryPlaceholder);
  });
});

describe("SignInPopover (the header's button)", () => {
  const html = renderToStaticMarkup(<SignInPopover href="/en/sign-in" label="Sign in" t={t} />);

  it("is a link to the sign-in page that names the panel it opens", () => {
    const link = /<a [^>]*>/.exec(html)?.[0] ?? "";
    expect(link).toContain('href="/en/sign-in"');
    expect(link).toContain('aria-haspopup="dialog"');
    expect(link).toContain('aria-expanded="false"');
    const panel = /aria-controls="([^"]+)"/.exec(link)?.[1];
    expect(html).toContain(`id="${panel}"`);
    expect(html).toMatch(/<a [^>]*>Sign in<\/a>/);
  });

  it("has a closed panel with a name, and no form before it is opened (the steps load on the first opening)", () => {
    const panel = /<div[^>]*popover="auto"[^>]*>/.exec(html)?.[0] ?? "";
    expect(panel).toContain('role="dialog"');
    expect(panel).toContain('aria-label="Sign in"');
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
  });
});

describe("the steps inside the panel (embedded)", () => {
  const html = renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <SignInSteps t={t} embedded onFinish={() => {}} />
    </ErrorTextProvider>,
  );
  const hrefOf = (text: string) => new RegExp(`<a [^>]*href="([^"]+)"[^>]*>(?:(?!</a>).)*${text.replace(/[?]/g, "\\$&")}`, "s").exec(html)?.[1];

  it("names itself, and has the email and password boxes with the email box ready to type in", () => {
    expect(html).toMatch(/<h2[^>]*>Sign in<\/h2>/);
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    expect(/<input[^>]*name="email"[^>]*>/.exec(html)?.[0]).toContain("autofocus");
    expect(html).toMatch(/<form [^>]*method="post"/);
    expect(/<button[^>]*type="submit"[^>]*>/.exec(html)?.[0]).toContain('disabled=""');
  });

  it("offers the three ways in: the password, the email link and the sign-up page", () => {
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>(?:(?!<\/button>)[\s\S])*Sign in/);
    expect(html).toContain("Email me a sign-in link");
    expect(hrefOf("Create an account")).toBe("/en/sign-up");
    expect(hrefOf("Forgot password?")).toBe("/en/forgot-password");
  });

  it("leaves the merchant link and the page's closing line to the sign-in page", () => {
    expect(html).not.toContain("Need merchant prices?");
    expect(html).not.toContain("New here?");
  });
});

describe("the steps on the sign-in page (not embedded)", () => {
  const html = renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <SignInSteps t={t} onFinish={() => {}} />
    </ErrorTextProvider>,
  );

  it("has no heading of its own and does not take the focus", () => {
    expect(html).not.toContain("<h2");
    expect(/<input[^>]*name="email"[^>]*>/.exec(html)?.[0]).not.toContain("autofocus");
    expect(html).toContain("Need merchant prices?");
  });

  it("opens with the step it was given (the code step after a mailed link)", () => {
    const totp = renderToStaticMarkup(
      <ErrorTextProvider messages={errors}>
        <SignInSteps t={t} start="totp" onFinish={() => {}} />
      </ErrorTextProvider>,
    );
    expect(totp).toContain("Two-step verification");
    expect(totp).not.toContain('name="password"');
  });
});
