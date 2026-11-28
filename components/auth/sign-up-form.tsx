"use client";
// SignUpForm: the sign-up page's form. It collects the full details (email, password, first name, last name, country and phone;
// all required) and sends them to `POST /store/v1/auth/sign-up` with the Turnstile token. The checks mirror the server's, the
// server's field errors land under their fields with the focus on the first one, and a 204 (the same for every valid body, whether or
// not the address has an account) turns the form into the neutral "check your email" state, with the line that tells the person to
// open the link on this device to finish at once: opened where the form was filled the link applies the details and the password;
// opened anywhere else it asks the person to confirm the details and choose the password. The password is cleared from the state as
// soon as it was sent. The form is server-rendered, so it says `method="post"` (a submit before the script loads can never put the
// password or the details in the address) and keeps its button disabled until the component has mounted in the browser
// (`useMounted`). The decisions live in sign-up-fields.ts (unit tested).
import { useRef, useState, type FormEvent } from "react";
import { fmt } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import type { AuthMessages } from "@/lib/i18n/messages/auth";
import { useMounted } from "@/lib/use-mounted";
import { Turnstile } from "@/components/turnstile";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { requestSignUp } from "./auth-requests";
import { DetailsFields } from "./details-fields";
import { FormAlert } from "./form-alert";
import { NO_FEEDBACK, type FormFeedback } from "./form-errors";
import { EMPTY_DETAILS, submitSignUp, type DetailsValues } from "./sign-up-fields";
import { useFocusOnFeedback } from "./use-focus-on-feedback";
import { useTurnstile } from "./use-turnstile";

/** The strings the form needs. */
export type SignUpFormText = {
  fields: AuthMessages["fields"];
  shared: Pick<AuthMessages["shared"], "securityCheckWait" | "checkEmailTitle" | "useDifferentEmail">;
  signUp: Pick<AuthMessages["signUp"], "form" | "errors">;
};

export type SignUpFormProps = {
  /** The countries the shop sells to, `{ code, name }`. */
  countries: readonly { code: string; name: string }[];
  t: SignUpFormText;
};

export type SignUpFieldsProps = {
  values: DetailsValues;
  password: string;
  onChange: (key: keyof DetailsValues | "password", value: string) => void;
  errors: Record<string, string>;
  countries: SignUpFormProps["countries"];
  t: Pick<SignUpFormText, "fields">;
};

/** The six inputs in the order they are asked, each with its own error under it. */
export function SignUpFields({ values, password, onChange, errors, countries, t }: SignUpFieldsProps) {
  return (
    <>
      <DetailsFields values={values} onChange={onChange} errors={errors} countries={countries} t={t.fields} />
      <PasswordInput
        name="password"
        label={t.fields.password}
        hint={t.fields.passwordRules}
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => onChange("password", e.target.value)}
        error={errors.password}
      />
    </>
  );
}

/** The state after a 204: the neutral "check your email" with the line about the device, and the way back to the form. */
export function SignUpSent({ email, t, onBack }: { email: string; t: SignUpFormText; onBack: () => void }) {
  return (
    <div className="grid gap-5">
      <Alert tone="success" title={t.shared.checkEmailTitle}>
        <p>{fmt(t.signUp.form.sentText, { email })}</p>
        <p className="mt-2">{t.signUp.form.sentDevice}</p>
      </Alert>
      <Button variant="secondary" block onClick={onBack}>
        {t.shared.useDifferentEmail}
      </Button>
    </div>
  );
}

export function SignUpForm({ countries, t }: SignUpFormProps) {
  const errorText = useErrorText();
  const ts = useTurnstile();
  const form = useRef<HTMLFormElement>(null);
  const mounted = useMounted();
  const [values, setValues] = useState<DetailsValues>(EMPTY_DETAILS);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useFocusOnFeedback(feedback, form);

  function onChange(key: keyof DetailsValues | "password", value: string) {
    if (key === "password") setPassword(value);
    else setValues((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    const outcome = await submitSignUp(
      { ...values, password },
      {
        countries: countries.map((country) => country.code),
        text: t.signUp.errors,
        errorText,
        token: () => ts.ensureToken(),
        securityCheckWait: t.shared.securityCheckWait,
        send: requestSignUp,
      },
    );
    setBusy(false);
    if (outcome.sent) {
      // The password was sent: it does not stay in the page's state.
      setPassword("");
      setSentTo(outcome.email);
    } else {
      setFeedback(outcome.feedback);
    }
    // A Turnstile token works once, even when the request failed: ask the widget for the next one.
    if (outcome.sent || outcome.tokenSpent) ts.reset();
  }

  if (sentTo) return <SignUpSent email={sentTo} t={t} onBack={() => setSentTo(null)} />;

  return (
    <form ref={form} method="post" onSubmit={onSubmit} noValidate className="grid gap-5">
      <SignUpFields values={values} password={password} onChange={onChange} errors={feedback.fields} countries={countries} t={t} />
      <Turnstile onToken={ts.setToken} resetKey={ts.resetKey} />
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <Button type="submit" size="lg" block loading={busy} disabled={!mounted}>
        {t.signUp.form.submit}
      </Button>
    </form>
  );
}
