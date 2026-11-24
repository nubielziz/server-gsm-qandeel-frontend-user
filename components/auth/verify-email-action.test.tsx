import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The page needs the query string and nothing else from the router: a stand-in without `useRouter` fails the test if the page
// ever reaches for it (it must never navigate into the account).
const nav = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(nav.query) }));

import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { auth } from "@/lib/i18n/messages/auth";
import { errors } from "@/lib/i18n/messages/errors";
import { VerifyEmailAction, VerifyEmailView, type VerifyEmailState } from "./verify-email-action";

const strings = { ...auth.verifyEmail, signIn: auth.shared.signIn };
const view = (state: VerifyEmailState) => renderToStaticMarkup(<VerifyEmailView state={state} strings={strings} />);

beforeEach(() => {
  nav.query = "";
});

describe("the email link page", () => {
  it("asks for a press of the button and says it does not sign in", () => {
    nav.query = "token=abc";
    const html = renderToStaticMarkup(
      <ErrorTextProvider messages={errors}>
        <VerifyEmailAction t={{ shared: auth.shared, verifyEmail: auth.verifyEmail }} />
      </ErrorTextProvider>,
    );
    expect(html).toContain("Verify my email");
    expect(html).toContain("This does not sign you in.");
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it("without a token explains the problem and offers the sign-in page", () => {
    const html = renderToStaticMarkup(
      <ErrorTextProvider messages={errors}>
        <VerifyEmailAction t={{ shared: auth.shared, verifyEmail: auth.verifyEmail }} />
      </ErrorTextProvider>,
    );
    expect(html).toContain("This page needs the link from your email");
    expect(html).toContain('href="/en/sign-in"');
    expect(html).not.toContain("<button");
  });

  it("after it worked, the only way on is a link to sign-in: nothing leads into the account", () => {
    const html = view("done");
    expect(html).toContain("Your email is verified");
    expect(html).toContain('href="/en/sign-in"');
    expect(html).not.toContain("/en/account");
    expect(html).not.toMatch(/[?&]as=/);
  });

  it("a spent link ends at the sign-in page too", () => {
    const html = view("expired");
    expect(html).toContain("This link has expired");
    expect(html).toContain('href="/en/sign-in"');
    expect(html).not.toContain("/en/account");
  });
});
