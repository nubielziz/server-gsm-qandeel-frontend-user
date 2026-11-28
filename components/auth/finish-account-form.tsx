"use client";
// FinishAccountForm: "Finish creating your account", the form a sign-up link opens when it was opened in another browser than the
// one that filled the sign-up form (a phone's mail app, a second device). The account exists and is signed in, but NOTHING of the
// sign-up form was applied: a stranger could have typed any name, country, phone or password for this address, and the browser that
// opens the link is not the one that knows the password. So the details the server kept (`pendingDetails`: names, country, phone;
// never the password) are shown to the person who proved the mailbox, to check or change, with an empty password box with the usual
// rules; the submit sends `POST /store/v1/auth/sign-up/finish` (the signed-in session, CSRF added by the client) and goes on as
// a normal sign-in does. The field errors land under the fields with the focus on the first one. The decisions live in
// sign-up-fields.ts (unit tested). Browser only.
import { useRef, useState, type FormEvent } from "react";
import { useErrorText } from "@/lib/i18n/error-text";
import type { PendingDetails } from "@/lib/api/types";
import type { AuthMessages } from "@/lib/i18n/messages/auth";
import { useMounted } from "@/lib/use-mounted";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { StepHeading } from "./auth-heading";
import { finishSignUp } from "./auth-requests";
import { DetailsFields } from "./details-fields";
import { FormAlert } from "./form-alert";
import { NO_FEEDBACK, type FormFeedback } from "./form-errors";
import { finishStart, submitFinish, type FinishValues, type SignUpErrorTexts } from "./sign-up-fields";
import { useFocusOnFeedback } from "./use-focus-on-feedback";

/** The strings the form needs. */
export type FinishAccountText = {
  fields: AuthMessages["fields"];
  errors: SignUpErrorTexts;
  finish: AuthMessages["signIn"]["finish"];
  /** The label of the button that goes on when the account turns out to have a password already. */
  continue: string;
};

export type FinishAccountFormProps = {
  /** The details the server kept for the link (the exchange's `pendingDetails`). */
  pending: PendingDetails;
  /** The countries the menu offers, `{ code, name }`: the shop's tax-rate countries, else the full list. */
  countries: readonly { code: string; name: string }[];
  t: FinishAccountText;
  /** The account is finished: go where a normal sign-in goes. */
  onDone: () => void | Promise<void>;
};

/** The finish form: the heading and its line, the four details (prefilled), the password (empty), the submit button. */
export function FinishAccountForm({ pending, countries, t, onDone }: FinishAccountFormProps) {
  const errorText = useErrorText();
  const form = useRef<HTMLFormElement>(null);
  const mounted = useMounted();
  const [values, setValues] = useState<FinishValues>(() =>
    finishStart(
      pending,
      countries.map((country) => country.code),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  const [alreadySet, setAlreadySet] = useState(false);

  useFocusOnFeedback(feedback, form);

  function onChange(key: keyof FinishValues | "email", value: string) {
    if (key === "email") return;
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    const outcome = await submitFinish(values, {
      countries: countries.map((country) => country.code),
      text: t.errors,
      errorText,
      send: finishSignUp,
    });
    if (outcome.done) {
      // The password was sent: it does not stay in the page's state. The button stays busy while the page goes on.
      setValues((current) => ({ ...current, password: "" }));
      await onDone();
      return;
    }
    setBusy(false);
    if (outcome.alreadySet) {
      setValues((current) => ({ ...current, password: "" }));
      setAlreadySet(true);
      return;
    }
    setFeedback(outcome.feedback);
  }

  if (alreadySet) {
    return (
      <div className="grid gap-5">
        <Alert tone="info">{t.finish.alreadySet}</Alert>
        <Button size="lg" block onClick={() => void onDone()}>
          {t.continue}
        </Button>
      </div>
    );
  }

  return (
    <form ref={form} method="post" onSubmit={onSubmit} noValidate className="grid gap-5">
      <StepHeading title={t.finish.title} text={t.finish.text} />
      <DetailsFields values={values} onChange={onChange} hideEmail errors={feedback.fields} countries={countries} t={t.fields} />
      <PasswordInput
        name="password"
        label={t.fields.password}
        hint={t.fields.passwordRules}
        autoComplete="new-password"
        required
        value={values.password}
        onChange={(e) => onChange("password", e.target.value)}
        error={feedback.fields.password}
      />
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <Button type="submit" size="lg" block loading={busy} disabled={!mounted}>
        {t.finish.submit}
      </Button>
    </form>
  );
}
