"use client";
// CustomerLinkConfirm: the landing of a customer email link that signs the customer in (`/sign-in?token=` from the
// magic-link mail, `/verify-email?token=`). It never submits by itself: mail scanners open links, and the token works
// once, so a person presses the button. `POST /store/v1/auth/verify {token}` → a session → the account (or `next`).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import type { StoreMe } from "@/lib/api/types";
import { useErrorText } from "@/lib/i18n/error-text";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormAlert } from "./form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "./form-errors";

export type CustomerLinkConfirmProps = {
  token: string;
  /** Where to go once signed in (already checked with `safeNext`). */
  target: string;
  strings: {
    /** Heading above the text; leave out when the page's `h1` already says it. */
    title?: string;
    text: string;
    submit: string;
    expiredTitle: string;
    expiredText: string;
    requestNewLink: string;
  };
  /** Expired link: what the "request a new link" button does (e.g. switch the sign-in form to the email-link mode). */
  onRequestNewLink?: () => void;
  /** Expired link on a page of its own: where "request a new link" goes. */
  requestNewHref?: string;
};

export function CustomerLinkConfirm({ token, target, strings: s, onRequestNewLink, requestNewHref }: CustomerLinkConfirmProps) {
  const router = useRouter();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    try {
      await api.post<StoreMe>("/store/v1/auth/verify", { token });
      router.replace(target);
      router.refresh();
    } catch (error) {
      if (isApiError(error) && error.status === 410) setExpired(true);
      else setFeedback(feedbackFrom(error, errorText, []));
      setBusy(false);
    }
  }

  if (expired) {
    return (
      <div className="grid gap-5">
        <Alert tone="warning" title={s.expiredTitle}>
          {s.expiredText}
        </Alert>
        {requestNewHref ? (
          <ButtonLink href={requestNewHref} size="lg" block>
            {s.requestNewLink}
          </ButtonLink>
        ) : (
          <Button variant="primary" size="lg" block onClick={onRequestNewLink}>
            {s.requestNewLink}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div>
        {s.title ? <h2 className="text-heading text-ink">{s.title}</h2> : null}
        <p className={s.title ? "mt-1.5 text-body text-ink-muted" : "text-body text-ink-muted"}>{s.text}</p>
      </div>
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <Button size="lg" block loading={busy} onClick={confirm}>
        {s.submit}
      </Button>
    </div>
  );
}
