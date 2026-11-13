"use client";
// UnsubscribeForm: the page behind the "Unsubscribe" link of marketing emails (`/unsubscribe?token=`). The token is read
// in the browser (the page itself is static) and is sent only when the visitor presses the button: mail scanners open
// links, so the page never submits by itself. `POST /store/v1/marketing/unsubscribe/:token` has no body and no CSRF
// need; it answers 204 (also when the address was already off), 410 TOKEN_INVALID for a wrong or old token, 422 for a
// token that is too short and 400 for one that is too long. The token is never logged.
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { pathOf } from "@/lib/api/query";
import { localePath, type Locale } from "@/lib/i18n/config";
import { useErrorText } from "@/lib/i18n/error-text";
import type { NotificationsMessages } from "@/lib/i18n/messages/notifications";
import { FormAlert } from "@/components/auth/form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "@/components/auth/form-errors";
import { useFocusOnFeedback } from "@/components/auth/use-focus-on-feedback";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";

/** The API reads a token of at most 100 characters (the real ones have about 37); a longer one is refused before any call. */
const MAX_TOKEN_LENGTH = 100;

export type UnsubscribeFormProps = {
  locale: Locale;
  t: NotificationsMessages["unsubscribe"];
};

export function UnsubscribeForm({ locale, t }: UnsubscribeFormProps) {
  const raw = useSearchParams().get("token")?.trim() ?? "";
  const token = raw.length > 0 && raw.length <= MAX_TOKEN_LENGTH ? raw : null;
  const errorText = useErrorText();
  const form = useRef<HTMLFormElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const submitted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<"done" | "invalid" | null>(null);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  useFocusOnFeedback(feedback, form);

  // The button is gone once there is an outcome: move the focus to the message (only after a submit, never on load).
  useEffect(() => {
    if (outcome && submitted.current) result.current?.focus();
  }, [outcome]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || !token) return;
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    try {
      await api.post(pathOf("/store/v1/marketing/unsubscribe/:token", { token }));
      submitted.current = true;
      setOutcome("done");
    } catch (error) {
      if (isApiError(error) && (error.status === 410 || error.status === 404 || error.status === 422)) {
        submitted.current = true;
        setOutcome("invalid");
      } else {
        // 429 shows the wait, anything else the generic text with the reference; the button stays for a new try.
        setFeedback(feedbackFrom(error, errorText, []));
      }
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <ButtonLink href={localePath(locale)} variant="secondary" size="lg">
      {t.backHome}
    </ButtonLink>
  );

  if (outcome === "done") {
    return (
      <div className="grid gap-5">
        <Alert ref={result} tabIndex={-1} tone="success" title={t.doneTitle}>
          {t.doneText}
        </Alert>
        <div>{back}</div>
      </div>
    );
  }
  if (outcome === "invalid" || !token) {
    return (
      <div className="grid gap-5">
        <Alert ref={result} tabIndex={-1} tone="warning" title={t.invalidTitle}>
          {t.invalidText}
        </Alert>
        <div>{back}</div>
      </div>
    );
  }

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="grid gap-5">
      {/* Before the page is interactive a press would submit the form natively (a GET to this page): the field keeps the token in that URL. */}
      <input type="hidden" name="token" value={token} />
      <p className="text-body text-ink-muted">{t.text}</p>
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <div>
        <Button type="submit" size="lg" loading={busy}>
          {t.submit}
        </Button>
      </div>
    </form>
  );
}
