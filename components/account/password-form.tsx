"use client";
// PasswordForm: change the password of a customer who has one (`POST /store/v1/me/password`). A wrong current password
// is a 422 on `currentPassword` (never a 401, so nobody is signed out); a weak or unchanged password is WEAK_PASSWORD on
// `newPassword`. The server ends the sessions on the customer's OTHER devices; this one stays signed in.
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api/browser";
import { useErrorText } from "@/lib/i18n/error-text";
import type { AccountMessages } from "@/lib/i18n/messages/account";
import { FormAlert } from "@/components/auth/form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "@/components/auth/form-errors";
import { useFocusOnFeedback } from "@/components/auth/use-focus-on-feedback";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "@/components/ui/toast";

export function PasswordForm({ t }: { t: AccountMessages["settings"]["password"] }) {
  const errorText = useErrorText();
  const form = useRef<HTMLFormElement>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  useFocusOnFeedback(feedback, form);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const required = errorText.field({ field: "", code: "required", message: "" }) ?? "";
    const missing: Record<string, string> = {};
    if (!current) missing.currentPassword = required;
    if (!next) missing.newPassword = required;
    else if (next !== confirm) missing.confirm = t.mismatch;
    if (Object.keys(missing).length) {
      setFeedback({ fields: missing, message: null, reference: null });
      return;
    }
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    setDone(false);
    try {
      await api.post("/store/v1/me/password", { currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
      toast.success(t.saved);
    } catch (error) {
      setFeedback(feedbackFrom(error, errorText, ["currentPassword", "newPassword"], { currentPassword: t.wrongCurrent }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="grid gap-5">
      <PasswordInput
        name="currentPassword"
        label={t.current}
        autoComplete="current-password"
        required
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        error={feedback.fields.currentPassword}
      />
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <PasswordInput
          name="newPassword"
          label={t.next}
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
          error={feedback.fields.newPassword}
        />
        <PasswordInput
          name="confirmPassword"
          label={t.confirm}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={feedback.fields.confirm}
        />
      </div>
      <p className="-mt-2 text-small text-ink-subtle">{t.rules}</p>
      <FormAlert message={feedback.message} reference={feedback.reference} />
      {done ? (
        <Alert tone="success" title={t.saved}>
          {t.savedText}
        </Alert>
      ) : null}
      <div>
        <Button type="submit" loading={busy}>
          {t.submit}
        </Button>
      </div>
    </form>
  );
}
