"use client";
// MagicLinkForm: asks for an email and sends a sign-in link (`POST /store/v1/auth/magic-link`, Turnstile). An unknown
// email creates an account of the retail rank (self sign-up), so the same form serves "sign in" and "sign up". The answer is
// always the same neutral "check your email": the page never says whether the address has an account.
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Mail } from "lucide-react";
import { useErrorText } from "@/lib/i18n/error-text";
import { fmt } from "@/lib/i18n/define";
import { Turnstile } from "@/components/turnstile";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestSignInLink } from "./auth-requests";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "./form-errors";
import { FormAlert } from "./form-alert";
import { useFocusOnFeedback } from "./use-focus-on-feedback";
import { useTurnstile } from "./use-turnstile";

export type MagicLinkFormProps = {
  strings: {
    email: string;
    emailPlaceholder: string;
    /** Help text under the email field. */
    hint?: string;
    submit: string;
    /** "… a link is on its way to {email} …" */
    sentText: string;
    sentTitle: string;
    useDifferentEmail: string;
    securityCheckWait: string;
  };
  /** The email to start with (carried over from the password form). */
  defaultEmail?: string;
  /** Extra content under the submit button (a "use my password instead" link). */
  children?: ReactNode;
};

export function MagicLinkForm({ strings: s, defaultEmail = "", children }: MagicLinkFormProps) {
  const errorText = useErrorText();
  const ts = useTurnstile();
  const form = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useFocusOnFeedback(feedback, form);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const address = email.trim();
    if (!address.includes("@")) {
      setFeedback({ fields: { email: errorText.field({ field: "email", code: "required", message: "" }) ?? "" }, message: null, reference: null });
      return;
    }
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    try {
      const turnstileToken = await ts.ensureToken();
      if (!turnstileToken) {
        setFeedback({ fields: {}, message: s.securityCheckWait, reference: null });
        return;
      }
      await requestSignInLink(address, turnstileToken);
      setSentTo(address);
    } catch (error) {
      setFeedback(feedbackFrom(error, errorText, ["email"]));
    } finally {
      setBusy(false);
      ts.reset();
    }
  }

  if (sentTo) {
    return (
      <div className="grid gap-5">
        <Alert tone="success" title={s.sentTitle}>
          {fmt(s.sentText, { email: sentTo })}
        </Alert>
        <Button variant="secondary" block onClick={() => setSentTo(null)}>
          {s.useDifferentEmail}
        </Button>
      </div>
    );
  }

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="grid gap-5">
      <Input
        type="email"
        name="email"
        label={s.email}
        hint={s.hint}
        placeholder={s.emailPlaceholder}
        leading={<Mail aria-hidden="true" />}
        autoComplete="email"
        inputMode="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={feedback.fields.email}
      />
      <Turnstile onToken={ts.setToken} resetKey={ts.resetKey} />
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <Button type="submit" size="lg" block loading={busy}>
        {s.submit}
      </Button>
      {children}
    </form>
  );
}
