// The strings the header's sign-in panel needs, cut out of the auth messages on the server: the panel is a Client Component on
// every shop page, so it gets only what its steps show (no text of the mailed link's landing, no label of the sign-up form).
// Server-compatible.
import type { AuthMessages } from "@/lib/i18n/messages/auth";
import type { SignInStepsText } from "./sign-in-flow";

/** The texts of SignInSteps (`SignInStepsText`) from the auth messages. */
export function signInStepsText(auth: AuthMessages): SignInStepsText {
  const { fields, shared, signIn } = auth;
  return {
    fields: {
      email: fields.email,
      emailPlaceholder: fields.emailPlaceholder,
      password: fields.password,
      passwordPlaceholder: fields.passwordPlaceholder,
      newPassword: fields.newPassword,
      confirmPassword: fields.confirmPassword,
      passwordRules: fields.passwordRules,
      passwordsDontMatch: fields.passwordsDontMatch,
      code: fields.code,
    },
    shared,
    signIn: {
      metaTitle: signIn.metaTitle,
      title: signIn.title,
      subtitle: signIn.subtitle,
      submit: signIn.submit,
      forgot: signIn.forgot,
      emailLink: signIn.emailLink,
      merchantPrices: signIn.merchantPrices,
      or: signIn.or,
      noAccount: signIn.noAccount,
      createAccount: signIn.createAccount,
      invalidCredentials: signIn.invalidCredentials,
      expired: signIn.expired,
      magic: signIn.magic,
      totp: signIn.totp,
      newPassword: signIn.newPassword,
    },
  };
}
