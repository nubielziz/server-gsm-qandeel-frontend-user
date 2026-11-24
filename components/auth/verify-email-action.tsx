"use client";
// VerifyEmailAction: the page behind an emailed "confirm your email" link (`/verify-email?token=`), for every account: a
// button → POST /client/auth/verify-email. It only stamps the address as verified and signs nobody in: a person who can read
// the mailbox but not the password must not get past the password and two-step sign-in. Success points to sign-in, so this
// file never reads the router. Never submits by itself: mail scanners open links and the token works once.
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { isApiError } from "@/lib/api/errors";
import { useErrorText } from "@/lib/i18n/error-text";
import type { AuthMessages } from "@/lib/i18n/messages/auth";
import { sitePath } from "@/lib/site-path";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { verifyEmailAddress } from "./auth-requests";
import { FormAlert } from "./form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "./form-errors";
import { LinkProblem } from "./link-problem";

type Strings = AuthMessages["verifyEmail"] & { signIn: string };

/** What the page shows: the button, the answer after it, or the problem with the link. */
export type VerifyEmailState = "missing" | "ask" | "done" | "expired";

export type VerifyEmailViewProps = {
  state: VerifyEmailState;
  strings: Strings;
  busy?: boolean;
  feedback?: FormFeedback;
  onVerify?: () => void;
};

/** The drawing of the page for each state. The only way on is a link to sign-in. */
export function VerifyEmailView({ state, strings: s, busy = false, feedback = NO_FEEDBACK, onVerify }: VerifyEmailViewProps) {
  const signInLink = (
    <ButtonLink href={sitePath("/sign-in")} size="lg" block>
      {s.signIn}
    </ButtonLink>
  );
  if (state === "missing") return <LinkProblem title={s.missingTitle} text={s.missingText} action={signInLink} />;
  if (state === "expired") return <LinkProblem title={s.expiredTitle} text={s.expiredText} action={signInLink} />;
  if (state === "done") {
    return (
      <div className="grid gap-5">
        <Alert tone="success" title={s.doneTitle}>
          {s.doneText}
        </Alert>
        {signInLink}
      </div>
    );
  }
  return (
    <div className="grid gap-5">
      <p className="text-body text-ink-muted">{s.text}</p>
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <Button size="lg" block loading={busy} onClick={onVerify}>
        {s.submit}
      </Button>
    </div>
  );
}

export type VerifyEmailActionProps = {
  t: Pick<AuthMessages, "shared" | "verifyEmail">;
};

export function VerifyEmailAction({ t }: VerifyEmailActionProps) {
  const token = useSearchParams().get("token");
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"ask" | "done" | "expired">("ask");
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);

  async function verify() {
    if (busy || !token) return;
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    try {
      await verifyEmailAddress(token);
      setState("done");
    } catch (error) {
      if (isApiError(error) && error.status === 410) setState("expired");
      else setFeedback(feedbackFrom(error, errorText, []));
    } finally {
      setBusy(false);
    }
  }

  return (
    <VerifyEmailView
      state={token ? state : "missing"}
      strings={{ ...t.verifyEmail, signIn: t.shared.signIn }}
      busy={busy}
      feedback={feedback}
      onVerify={verify}
    />
  );
}
