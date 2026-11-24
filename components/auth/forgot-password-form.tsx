"use client";
// ForgotPasswordForm: asks for an email and sends a password link. One route and one answer for every account
// (`POST /client/auth/password/forgot`, Turnstile always sent), so there is no account-type choice. The success text is the
// same for every address: the page never says whether an account exists (handoff §4.1, §5.6).
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { fmt } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import type { AuthMessages } from "@/lib/i18n/messages/auth";
import { sitePath } from "@/lib/site-path";
import { Turnstile } from "@/components/turnstile";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authLinkClass } from "./auth-heading";
import { requestPasswordLink } from "./auth-requests";
import { FormAlert } from "./form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "./form-errors";
import { useFocusOnFeedback } from "./use-focus-on-feedback";
import { useTurnstile } from "./use-turnstile";

export type ForgotPasswordFormProps = {
  t: Pick<AuthMessages, "fields" | "shared" | "forgot">;
};

export function ForgotPasswordForm({ t }: ForgotPasswordFormProps) {
  const errorText = useErrorText();
  const ts = useTurnstile();
  const form = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useFocusOnFeedback(feedback, form);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const address = email.trim();
    if (!address.includes("@")) {
      setFeedback({
        fields: { email: errorText.field({ field: "email", code: "required", message: "" }) ?? "" },
        message: null,
        reference: null,
      });
      return;
    }
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    try {
      const turnstileToken = await ts.ensureToken();
      if (!turnstileToken) {
        setFeedback({ fields: {}, message: t.shared.securityCheckWait, reference: null });
        return;
      }
      await requestPasswordLink(address, turnstileToken);
      setSentTo(address);
    } catch (error) {
      setFeedback(feedbackFrom(error, errorText, ["email"]));
    } finally {
      setBusy(false);
      ts.reset();
    }
  }

  const signIn = sitePath("/sign-in");

  if (sentTo) {
    return (
      <div className="grid gap-5">
        <Alert tone="success" title={t.forgot.sentTitle}>
          {fmt(t.forgot.sentText, { email: sentTo })}
        </Alert>
        <Button variant="secondary" size="lg" block onClick={() => setSentTo(null)}>
          {t.shared.useDifferentEmail}
        </Button>
        <p className="text-center">
          <Link href={signIn} className={authLinkClass}>
            {t.shared.backToSignIn}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <form ref={form} onSubmit={onSubmit} noValidate className="grid gap-5">
        <Input
          type="email"
          name="email"
          label={t.fields.email}
          hint={t.forgot.hint}
          placeholder={t.fields.emailPlaceholder}
          leading={<Mail aria-hidden="true" />}
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={feedback.fields.email}
        />
        <Turnstile key="ts" onToken={ts.setToken} resetKey={ts.resetKey} />
        <FormAlert message={feedback.message} reference={feedback.reference} />
        <Button type="submit" size="lg" block loading={busy}>
          {t.forgot.submit}
        </Button>
      </form>
      <p className="text-center">
        <Link href={signIn} className={authLinkClass}>
          {t.shared.backToSignIn}
        </Link>
      </p>
    </div>
  );
}
