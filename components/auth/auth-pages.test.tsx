import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(""),
}));

// The sign-up form, the finish form and the merchant form list the countries of the shop's config: a stand-in that answers two
// tax-rate countries (or none, or an error, when a test says so).
const config = vi.hoisted(() => ({ taxRates: [{ country: "JO" }, { country: "US" }, { country: "JO" }], fails: false }));
vi.mock("@/lib/api/public", () => ({
  getStoreConfig: async () => {
    if (config.fails) throw new Error("the API is down");
    return { taxRates: config.taxRates, currencies: [] };
  },
}));

import BecomeMerchantPage from "@/app/en/(auth)/become-a-merchant/page";
import ForgotPasswordPage from "@/app/en/(auth)/forgot-password/page";
import SignInPage from "@/app/en/(auth)/sign-in/page";
import SignUpPage from "@/app/en/(auth)/sign-up/page";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { errors } from "@/lib/i18n/messages/errors";

const draw = (page: React.ReactNode) => renderToStaticMarkup(<ErrorTextProvider messages={errors}>{page}</ErrorTextProvider>);
/** A page with a part that waits for data (behind <Suspense>): rendered until everything has arrived. */
async function drawReady(page: React.ReactNode): Promise<string> {
  const stream = await renderToReadableStream(<ErrorTextProvider messages={errors}>{page}</ErrorTextProvider>);
  await stream.allReady;
  return await new Response(stream).text();
}

afterEach(() => {
  vi.unstubAllEnvs();
  config.taxRates = [{ country: "JO" }, { country: "US" }, { country: "JO" }];
  config.fails = false;
});

describe("the sign-up page", () => {
  it("is one form with the full details and nothing to choose: no account-type cards", async () => {
    const html = await drawReady(<SignUpPage />);
    expect(html).toContain("Create your account");
    for (const name of ["firstName", "lastName", "email", "phone", "country", "password"]) expect(html).toContain(`name="${name}"`);
    expect(html).toContain(">Create account<");
    expect(html).not.toContain("Email me a sign-in link");
    expect(html).not.toMatch(/type="radio"|role="radio"|role="radiogroup"/);
    expect(html).not.toContain("I am a");
  });

  it("offers the countries of the shop's config, each once, by name", async () => {
    const html = await drawReady(<SignUpPage />);
    expect(html).toContain('<option value="JO">Jordan</option>');
    expect(html).toContain('<option value="US">United States</option>');
    expect(html.match(/<option value="JO"/g)).toHaveLength(1);
    expect(html).not.toContain('<option value="FR"');
  });

  it("offers every country when the shop has no tax rate yet, and when the config cannot be read, so the menu is never empty", async () => {
    config.taxRates = [];
    const all = await drawReady(<SignUpPage />);
    expect(all).toContain('<option value="FR">France</option>');
    expect(all).toContain('<option value="JO">Jordan</option>');
    config.fails = true;
    const down = await drawReady(<SignUpPage />);
    expect(down).toContain('<option value="FR">France</option>');
  });

  it("shows the heading and the links before the countries have arrived (the form waits behind a skeleton of its own size)", () => {
    const html = draw(<SignUpPage />);
    expect(html).toContain("Create your account");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('name="firstName"');
    expect(html).toContain('href="/en/sign-in"');
  });

  it("links to sign-in, and has one quiet line that says merchant accounts are opened by the team", async () => {
    const html = await drawReady(<SignUpPage />);
    expect(html).toContain("Already have an account?");
    expect(html).toContain('href="/en/sign-in"');
    expect(html).toContain("Merchant accounts are opened by our team.");
    expect(html).toContain('href="/en/become-a-merchant"');
  });

  it("never links to the old application page", async () => {
    expect(await drawReady(<SignUpPage />)).not.toContain("/merchant/register");
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

  it("draws the password form once the shop's countries have been read (the finish form needs them), as a post form", async () => {
    const html = await drawReady(<SignInPage />);
    expect(html).toContain('name="password"');
    expect(html).toMatch(/<form [^>]*method="post"/);
    expect(html).toContain('href="/en/sign-up"');
  });

  it("still draws when the shop's config cannot be read", async () => {
    config.fails = true;
    expect(await drawReady(<SignInPage />)).toContain('name="password"');
  });
});

describe("the become-a-merchant page", () => {
  it("with the team's number: the title, three steps, the short form and the WhatsApp button with the number", async () => {
    vi.stubEnv("NEXT_PUBLIC_MERCHANT_WHATSAPP", "+12025550100");
    const html = await drawReady(<BecomeMerchantPage />);
    expect(html).toContain("Become a merchant");
    expect(html).toContain("How to apply");
    expect(html).toContain("<form");
    for (const name of ["firstName", "lastName", "email", "phone", "country"]) expect(html).toContain(`name="${name}"`);
    expect(html).not.toContain('name="password"');
    expect(html).toContain("Chat on WhatsApp");
    expect(html).toContain("+12025550100");
    // The same menu as the sign-up form: the shop's tax-rate countries; the link itself is written when the button is pressed.
    expect(html).toContain('<option value="JO">Jordan</option>');
    expect(html).toContain('<option value="US">United States</option>');
    expect(html).not.toContain('<option value="FR"');
    expect(html).toContain("Already have an account?");
    expect(html).toContain('href="/en/sign-in"');
  });

  it("offers every country when the shop has no tax rate, and shows a skeleton of its own size until the countries arrive", async () => {
    vi.stubEnv("NEXT_PUBLIC_MERCHANT_WHATSAPP", "+12025550100");
    const waiting = draw(<BecomeMerchantPage />);
    expect(waiting).toContain('aria-busy="true"');
    expect(waiting).not.toContain('name="firstName"');
    config.taxRates = [];
    const all = await drawReady(<BecomeMerchantPage />);
    expect(all).toContain('<option value="FR">France</option>');
    expect(all).toMatch(/<form [^>]*method="post"/);
  });

  it("without a number: no form, no WhatsApp link, and the support page is the one action", () => {
    vi.stubEnv("NEXT_PUBLIC_MERCHANT_WHATSAPP", "");
    const html = draw(<BecomeMerchantPage />);
    expect(html).toContain("Become a merchant");
    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("<form");
    expect(html).toContain('href="/en/support"');
    expect(html).toContain("Contact support");
  });
});
