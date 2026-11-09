"use client";
// SetPasswordForm: the page behind an emailed password link. Customers: `/set-password?token=` (reset or invitation)
// → POST /store/v1/auth/password/set. Merchants: `/merchant/set-password?token=` (reset AND staff invitation) →
// POST /client/auth/password/reset. Both set the password, end every session and sign nobody in, so success points to
// sign-in. WEAK_PASSWORD keeps the link usable (the error sits on the field); a 410 means the link is spent.
import { useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { localePath, type Locale } from "@/lib/i18n/config";
import { useErrorText } from "@/lib/i18n/error-text";
import type { AuthMessages } from "@/lib/i18n/messages/auth";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { FormAlert } from "./form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "./form-errors";
import { LinkProblem } from "./link-problem";
import { useFocusOnFeedback } from "./use-focus-on-feedback";

export type SetPasswordFormProps = {
  surface: "customer" | "merchant";
  locale: Locale;
  t: Pick<AuthMessages, "fields" | "shared" | "setPassword">;
};

export function SetPasswordForm({ surface, locale, t }: SetPasswordFormProps) {
  const token = useSearchParams().get("token");
  const errorText = useErrorText();
  const form = useRef<HTMLFormElement>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  const [state, setState] = useState<"form" | "expired" | "done">("form");

  useFocusOnFeedback(feedback, form);

  const forgot = `${localePath(locale, "/forgot-password")}?as=${surface}`;
  const signIn = `${localePath(locale, "/sign-in")}?as=${surface}`;
  const newLink = (
    <ButtonLink href={forgot} size="lg" block>
      {t.shared.requestNewLink}
    </ButtonLink>
  );

  if (!token) return <LinkProblem title={t.setPassword.missingTitle} text={t.setPassword.missingText} action={newLink} />;
  if (state === "expired") return <LinkProblem title={t.setPassword.expiredTitle} text={t.setPassword.expiredText} action={newLink} />;
  if (state === "done") {
    return (
      <div className="grid gap-5">
        <Alert tone="success" title={t.setPassword.doneTitle}>
          {t.setPassword.doneText}
        </Alert>
        <ButtonLink href={signIn} size="lg" block>
          {t.shared.signIn}
        </ButtonLink>
      </div>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || !token) return;
    if (password !== confirm) {
      setFeedback({ fields: { confirm: t.fields.passwordsDontMatch }, message: null, reference: null });
      return;
    }
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    try {
      await api.post(surface === "merchant" ? "/client/auth/password/reset" : "/store/v1/auth/password/set", { token, password });
      setState("done");
    } catch (error) {
      if (isApiError(error) && error.status === 410) setState("expired");
      else setFeedback(feedbackFrom(error, errorText, ["password"]));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="grid gap-5">
      <PasswordInput
        name="password"
        label={t.fields.newPassword}
        hint={t.fields.passwordRules}
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={feedback.fields.password}
      />
      <PasswordInput
        name="confirmPassword"
        label={t.fields.confirmPassword}
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={feedback.fields.confirm}
      />
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <Button type="submit" size="lg" block loading={busy}>
        {t.setPassword.submit}
      </Button>
    </form>
  );
}
