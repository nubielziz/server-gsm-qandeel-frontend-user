// A server-rendered form can be submitted before its script has loaded (a slow phone, a blocked script). A <form> with no method
// then sends a GET to its own address with every named field in the query string: a password or a person's details would land in
// the address bar, the history, the logs of every server and proxy on the way and the Referer of the next page. Every form of the
// site that holds a password, a code or personal data therefore says `method="post"` and keeps its submit button disabled until the
// component has mounted in the browser (a disabled default button also blocks the Enter key). This test renders each of those forms
// ON THE SERVER, as the page's HTML is, and checks both. The forms that do not hold such data are listed in the decision (011).
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The pages read the query in the browser: the sign-in form has none, the set-password form needs the token of its link.
const nav = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(nav.query),
}));

import { FAMILY_ROUTES } from "@/lib/account/routes";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { account } from "@/lib/i18n/messages/account";
import { auth } from "@/lib/i18n/messages/auth";
import { errors } from "@/lib/i18n/messages/errors";
import { support } from "@/lib/i18n/messages/support";
import { PasswordForm } from "@/components/account/password-form";
import { PreferencesForm } from "@/components/account/preferences-form";
import { ProfileForm } from "@/components/account/profile-form";
import { FinishAccountForm } from "@/components/auth/finish-account-form";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { MerchantApplyForm } from "@/components/auth/merchant-apply-form";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { SignInFlow } from "@/components/auth/sign-in-flow";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { TotpStep } from "@/components/auth/totp-step";
import { NewTicketForm } from "@/components/support/new-ticket-form";
import { SignedInTicketForm } from "@/components/support/signed-in-ticket-form";
import { TicketReplyForm } from "@/components/support/ticket-reply-form";

const noop = () => {};
const countries = [
  { code: "JO", name: "Jordan" },
  { code: "US", name: "United States" },
];
const authText = { fields: auth.fields, shared: auth.shared };

/** Draws a form the way the server does, with the error texts the pages provide. */
const serverHtml = (node: React.ReactNode) => renderToString(<ErrorTextProvider messages={errors}>{node}</ErrorTextProvider>);

/** Every <form …> opening tag of the page's HTML. */
const formTags = (html: string) => html.match(/<form\b[^>]*>/g) ?? [];
/** Every submit button's opening tag. */
const submitTags = (html: string) => (html.match(/<button\b[^>]*>/g) ?? []).filter((tag) => /\btype="submit"/.test(tag));

const forms: { name: string; query?: string; html: () => string }[] = [
  { name: "the sign-up form", html: () => serverHtml(<SignUpForm countries={countries} t={{ ...authText, signUp: auth.signUp }} />) },
  {
    name: "the merchant application form",
    html: () =>
      serverHtml(
        <MerchantApplyForm
          digits="12025550100"
          display="+12025550100"
          countries={countries}
          t={{ fields: auth.fields, errors: auth.signUp.errors, becomeMerchant: auth.becomeMerchant }}
        />,
      ),
  },
  {
    name: "the finish-your-account form",
    html: () =>
      serverHtml(
        <FinishAccountForm
          pending={{ firstName: "Sam", lastName: "Hamdan", country: "JO", phone: "+962791234567" }}
          countries={countries}
          t={{ fields: auth.fields, errors: auth.signUp.errors, finish: auth.signIn.finish, continue: auth.signIn.link.continue }}
          onDone={noop}
        />,
      ),
  },
  {
    name: "the sign-in form",
    html: () =>
      serverHtml(
        <SignInFlow t={{ ...authText, signIn: auth.signIn, signUp: { errors: auth.signUp.errors } }} countries={countries} />,
      ),
  },
  {
    name: "the sign-in link form (email)",
    html: () =>
      serverHtml(
        <MagicLinkForm
          strings={{
            email: auth.fields.email,
            emailPlaceholder: auth.fields.emailPlaceholder,
            submit: auth.signIn.magic.submit,
            sentText: auth.signIn.magic.sentText,
            sentTitle: auth.shared.checkEmailTitle,
            useDifferentEmail: auth.shared.useDifferentEmail,
            securityCheckWait: auth.shared.securityCheckWait,
          }}
        />,
      ),
  },
  { name: "the forgot-password form", html: () => serverHtml(<ForgotPasswordForm t={{ ...authText, forgot: auth.forgot }} />) },
  { name: "the set-password form", query: "token=abc", html: () => serverHtml(<SetPasswordForm t={{ ...authText, setPassword: auth.setPassword }} />) },
  {
    name: "the two-step code form",
    html: () => serverHtml(<TotpStep t={{ ...authText, signIn: auth.signIn }} onDone={noop} onExpired={noop} onBack={noop} />),
  },
  {
    name: "the change-password form of the account",
    html: () => serverHtml(<PasswordForm endpoint={FAMILY_ROUTES.store.password} t={account.settings.password} />),
  },
  {
    name: "the profile form of the account",
    html: () =>
      serverHtml(
        <ProfileForm
          initial={{ name: "Sam Hamdan", phone: "+962791234567", country: "JO", currency: "USD" }}
          email="sam@example.com"
          countries={countries}
          t={account.settings.profile}
        />,
      ),
  },
  {
    name: "the preferences form of the account",
    html: () =>
      serverHtml(
        <PreferencesForm
          initial={{ currency: "USD", marketingOptIn: false }}
          currencies={[{ code: "USD", name: "US dollar" }]}
          t={account.settings.preferences}
        />,
      ),
  },
  {
    name: "the support form of a visitor",
    html: () =>
      serverHtml(
        <NewTicketForm t={support} defaults={{ email: "", name: "", order: "", signedIn: false }} />,
      ),
  },
  {
    name: "the support form of a signed-in account",
    html: () => serverHtml(<SignedInTicketForm family="store" t={support} orders={[]} />),
  },
  {
    name: "the reply form of a ticket",
    html: () => serverHtml(<TicketReplyForm adapter={{ send: async () => ({}) as never, upload: async () => ({}) as never }} t={support.ticket.reply} onSent={noop} />),
  },
];

describe("a server-rendered form that holds a password or personal data is safe before its script loads", () => {
  for (const { name, html, query = "" } of forms) {
    describe(name, () => {
      nav.query = query;
      const page = html();

      it('says method="post", so a submit before the script loads never puts the fields in the address', () => {
        const tags = formTags(page);
        expect(tags.length).toBeGreaterThan(0);
        for (const tag of tags) {
          expect(tag).toContain('method="post"');
          // No action either: the page's own address, never a GET carrying a query.
          expect(tag).not.toMatch(/\baction=/);
        }
      });

      it("keeps its submit button disabled until the component has mounted in the browser", () => {
        const buttons = submitTags(page);
        expect(buttons.length).toBeGreaterThan(0);
        for (const tag of buttons) expect(tag).toContain('disabled=""');
      });
    });
  }

  it("covers the two forms the review named: sign-up and the merchant application", () => {
    const names = forms.map((form) => form.name);
    expect(names).toContain("the sign-up form");
    expect(names).toContain("the merchant application form");
  });
});
