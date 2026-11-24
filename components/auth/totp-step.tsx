"use client";
// TotpStep: the second step of a two-step sign-in, for every account (the password form and the sign-in link both lead here).
// `POST /client/auth/2fa {code}`. A wrong code is a 422 on `code` and keeps the step; a 401 means the pending session ended
// (10 minutes), so the page goes back to the form with its sentence. Browser only.
import { useRef, useState, type FormEvent } from "react";
import { useErrorText } from "@/lib/i18n/error-text";
import type { AuthMessages } from "@/lib/i18n/messages/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StepHeading } from "./auth-heading";
import { submitTotpCode } from "./auth-requests";
import { FormAlert } from "./form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "./form-errors";
import { pendingSessionEnded } from "./sign-in-steps";
import { useFocusOnFeedback } from "./use-focus-on-feedback";

export type TotpStepProps = {
  t: Pick<AuthMessages, "fields" | "shared" | "signIn">;
  /** The code was accepted: the account is signed in. */
  onDone: () => void | Promise<void>;
  /** The pending session ended: go back to the form with the "sign-in expired" sentence. */
  onExpired: () => void;
  /** "Back to sign in". */
  onBack: () => void;
};

export function TotpStep({ t, onDone, onExpired, onBack }: TotpStepProps) {
  const errorText = useErrorText();
  const form = useRef<HTMLFormElement>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  useFocusOnFeedback(feedback, form);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code)) {
      setFeedback({ fields: { code: t.signIn.totp.invalidCode }, message: null, reference: null });
      return;
    }
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    let leaving = false;
    try {
      await submitTotpCode(code);
      leaving = true;
      await onDone();
    } catch (error) {
      leaving = false;
      if (pendingSessionEnded(error)) {
        onExpired();
        return;
      }
      setFeedback(feedbackFrom(error, errorText, ["code"], { code: t.signIn.totp.invalidCode }));
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="grid gap-5">
      <StepHeading title={t.signIn.totp.title} text={t.signIn.totp.text} />
      <Input
        name="code"
        label={t.fields.code}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]*"
        required
        dir="ltr"
        className="text-center text-subheading tracking-[0.4em]"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        error={feedback.fields.code}
      />
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <Button type="submit" size="lg" block loading={busy}>
        {t.signIn.totp.submit}
      </Button>
      <Button variant="secondary" size="lg" block onClick={onBack}>
        {t.shared.backToSignIn}
      </Button>
    </form>
  );
}
