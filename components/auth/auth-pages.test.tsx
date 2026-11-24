import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(""),
}));

import BecomeMerchantPage from "@/app/en/(auth)/become-a-merchant/page";
import ForgotPasswordPage from "@/app/en/(auth)/forgot-password/page";
import SignInPage from "@/app/en/(auth)/sign-in/page";
import SignUpPage from "@/app/en/(auth)/sign-up/page";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { errors } from "@/lib/i18n/messages/errors";

const draw = (page: React.ReactNode) => renderToStaticMarkup(<ErrorTextProvider messages={errors}>{page}</ErrorTextProvider>);

afterEach(() => vi.unstubAllEnvs());

describe("the sign-up page", () => {
  const html = draw(<SignUpPage />);

  it("is the email form and nothing to choose: no account-type cards", () => {
    expect(html).toContain("Create your account");
    expect(html).toContain('name="email"');
    expect(html).toContain("Email me a sign-in link");
    expect(html).not.toMatch(/type="radio"|role="radio"|role="radiogroup"/);
    expect(html).not.toContain("I am a");
  });

  it("links to sign-in, and has one quiet line that says merchant accounts are opened by the team", () => {
    expect(html).toContain("Already have an account?");
    expect(html).toContain('href="/en/sign-in"');
    expect(html).toContain("Merchant accounts are opened by our team.");
    expect(html).toContain('href="/en/become-a-merchant"');
  });

  it("never links to the old application page", () => {
    expect(html).not.toContain("/merchant/register");
  });
});

describe("the forgot-password page", () => {
  it("is one form with no account-type switch", () => {
    const html = draw(<ForgotPasswordPage />);
    expect(html).toContain("Reset your password");
    expect(html).not.toMatch(/type="radio"|role="radio"|role="radiogroup"/);
    expect(html).not.toContain("Account type");
  });
});

describe("the sign-in page", () => {
  it("has the one heading and the one form (the form itself waits behind a placeholder until the query is read)", () => {
    const html = draw(<SignInPage />);
    expect(html).toContain("Sign in");
    expect(html).toContain("Welcome back to your account.");
    expect(html).not.toContain("One form for customers and merchants");
  });
});

describe("the become-a-merchant page", () => {
  it("with the team's number: the title, three steps and the WhatsApp link with the prefilled message", () => {
    vi.stubEnv("NEXT_PUBLIC_MERCHANT_WHATSAPP", "+12025550100");
    const html = draw(<BecomeMerchantPage />);
    expect(html).toContain("Become a merchant");
    expect(html).toContain("How to apply");
    expect(html).toContain(
      `https://wa.me/12025550100?text=${encodeURIComponent("Hello, I would like to open a merchant account.")}`,
    );
    expect(html).toContain("Already have an account?");
    expect(html).toContain('href="/en/sign-in"');
    expect(html).not.toContain("<form");
  });

  it("without a number: no WhatsApp link, and the support page is the one action", () => {
    vi.stubEnv("NEXT_PUBLIC_MERCHANT_WHATSAPP", "");
    const html = draw(<BecomeMerchantPage />);
    expect(html).toContain("Become a merchant");
    expect(html).not.toContain("wa.me");
    expect(html).toContain('href="/en/support"');
    expect(html).toContain("Contact support");
  });
});
