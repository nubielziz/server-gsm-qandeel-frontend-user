import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The flow reads the router and the query string from next/navigation: a stand-in that answers what a page would.
const nav = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(nav.query),
}));

import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { auth } from "@/lib/i18n/messages/auth";
import { errors } from "@/lib/i18n/messages/errors";
import { SignInFlow } from "./sign-in-flow";

function draw() {
  return renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <SignInFlow t={{ fields: auth.fields, shared: auth.shared, signIn: auth.signIn }} />
    </ErrorTextProvider>,
  );
}

/** The href of the link or button whose visible text is `text`. */
function hrefOf(html: string, text: string): string | undefined {
  const match = new RegExp(`<a [^>]*href="([^"]+)"[^>]*>(?:(?!</a>).)*${text.replace(/[?]/g, "\\$&")}`, "s").exec(html);
  return match?.[1];
}

beforeEach(() => {
  nav.query = "";
});

describe("the sign-in form: one form for every account", () => {
  it("has the two fields and the submit, and no choice of account type", () => {
    const html = draw();
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    expect(html).toContain(">Sign in<");
    expect(html).not.toMatch(/type="radio"|role="radio"|role="radiogroup"/);
    expect(html).not.toContain("Account type");
    expect(html).not.toMatch(/customers?\b/i);
  });

  it("shows the other ways in: the email link, forgot password, create account and the merchant prices link", () => {
    const html = draw();
    expect(html).toContain("Email me a sign-in link");
    expect(hrefOf(html, "Forgot password?")).toBe("/en/forgot-password");
    expect(hrefOf(html, "Create account")).toBe("/en/sign-up");
    expect(hrefOf(html, "Need merchant prices?")).toBe("/en/become-a-merchant");
  });

  it("does not read ?as=: an old link that carries it opens the same form and its links carry no account type", () => {
    nav.query = "as=merchant&next=/en/account/orders";
    const html = draw();
    expect(hrefOf(html, "Forgot password?")).toBe("/en/forgot-password");
    expect(hrefOf(html, "Create account")).toBe("/en/sign-up");
    expect(html).not.toMatch(/[?&]as=/);
  });

  it("never links to the old merchant application page", () => {
    expect(draw()).not.toContain("/merchant/register");
  });
});

describe("the sign-in link landing (?token=)", () => {
  beforeEach(() => {
    nav.query = "token=abc";
  });

  it("shows the explanation, a ticked box that adds the guest orders, and the button that finishes", () => {
    const html = draw();
    expect(html).toContain("You opened a sign-in link");
    // The box is ticked at the start: the attribute is ` checked=""` (the class names hold "checked:" too, so match the attribute).
    const box = /<input[^>]*type="checkbox"[^>]*>/.exec(html)?.[0] ?? "";
    expect(box).toContain('name="claimGuestOrders"');
    expect(box).toContain(' checked=""');
    expect(html).toContain("Add the orders I placed as a guest with this email");
    expect(html).toContain("Sign in to IMEI-HUB");
  });

  it("does not show the password form while the link waits for its button (it never signs in by itself)", () => {
    const html = draw();
    expect(html).not.toContain('name="password"');
  });
});
