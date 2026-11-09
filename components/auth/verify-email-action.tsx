"use client";
// VerifyEmailAction: the page behind an emailed "confirm your email" link.
// - Customer (`/verify-email?token=`): a button → POST /store/v1/auth/verify, which also opens a session → the account.
// - Merchant (`/merchant/verify-email?token=`): a button → POST /client/auth/verify-email (204). It only stamps the
//   email as verified and signs nobody in; the account still waits for staff approval (handoff §4.15).
// Never submits by itself: mail scanners open links and the token works once.
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { localePath, type Locale } from "@/lib/i18n/config";
import { useErrorText } from "@/lib/i18n/error-text";
import type { AuthMessages } from "@/lib/i18n/messages/auth";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { CustomerLinkConfirm } from "./customer-link-confirm";
import { FormAlert } from "./form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "./form-errors";
import { LinkProblem } from "./link-problem";
import { safeNext } from "./safe-next";

export type VerifyEmailActionProps = {
  surface: "customer" | "merchant";
  locale: Locale;
  t: Pick<AuthMessages, "shared" | "signIn" | "verifyEmail">;
};

export function VerifyEmailAction({ surface, locale, t }: VerifyEmailActionProps) {
  const params = useSearchParams();
  const token = params.get("token");
  const signIn = `${localePath(locale, "/sign-in")}?as=${surface}`;
  const signInLink = (
    <ButtonLink href={signIn} size="lg" block>
      {t.shared.signIn}
    </ButtonLink>
  );

  if (!token) return <LinkProblem title={t.verifyEmail.missingTitle} text={t.verifyEmail.missingText} action={signInLink} />;

  if (surface === "customer") {
    return (
      <CustomerLinkConfirm
        token={token}
        target={safeNext(params.get("next"), localePath(locale, "/account"))}
        requestNewHref={signIn}
        strings={{
          text: t.verifyEmail.customerText,
          submit: t.verifyEmail.customerSubmit,
          expiredTitle: t.verifyEmail.expiredTitle,
          expiredText: t.verifyEmail.expiredText,
          requestNewLink: t.shared.signIn,
        }}
      />
    );
  }
  return <MerchantVerify token={token} signInLink={signInLink} t={t} />;
}

function MerchantVerify({ token, signInLink, t }: { token: string; signInLink: ReactNode; t: VerifyEmailActionProps["t"] }) {
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"ask" | "done" | "expired">("ask");
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);

  async function verify() {
    if (busy) return;
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    try {
      await api.post("/client/auth/verify-email", { token });
      setState("done");
    } catch (error) {
      if (isApiError(error) && error.status === 410) setState("expired");
      else setFeedback(feedbackFrom(error, errorText, []));
    } finally {
      setBusy(false);
    }
  }

  if (state === "expired") return <LinkProblem title={t.verifyEmail.expiredTitle} text={t.verifyEmail.expiredText} action={signInLink} />;
  if (state === "done") {
    return (
      <div className="grid gap-5">
        <Alert tone="success" title={t.verifyEmail.merchantDoneTitle}>
          {t.verifyEmail.merchantDoneText}
        </Alert>
        {signInLink}
      </div>
    );
  }
  return (
    <div className="grid gap-5">
      <div>
        <p className="text-body text-ink-muted">{t.verifyEmail.merchantText}</p>
      </div>
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <Button size="lg" block loading={busy} onClick={verify}>
        {t.verifyEmail.merchantSubmit}
      </Button>
    </div>
  );
}
