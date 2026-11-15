"use client";
// "Resend verification email" (POST /client/auth/verify-email/resend, no body, no Content-Type): shown under the email
// field while the address is not verified. Answers (BH §5.2):
//   204 → "We sent a new link. Older links no longer work."
//   409 → the address is already verified (another tab or device used a link): say so and refresh the page, so the
//         badge turns to "Verified"
//   429 → five an hour: the shared RATE_LIMITED text with the wait from `Retry-After`
//   anything else → the shared text for the error code, with its request reference.
// The component keeps its message after the refresh (the button is gone by then, the note stays).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { useErrorText } from "@/lib/i18n/error-text";
import type { MerchantSettingsMessages } from "@/lib/i18n/messages/merchant-settings";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

type Note = { tone: "success" | "danger"; text: string };

/** 409 CONFLICT on the resend route means "already verified". */
export function isAlreadyVerified(error: unknown): boolean {
  return isApiError(error) && error.status === 409;
}

type Props = {
  /** `emailVerifiedAt !== null`: the button is hidden, a message that is still on screen stays. */
  verified: boolean;
  t: Pick<MerchantSettingsMessages["profile"], "resend" | "resending" | "resendSent" | "alreadyVerified">;
};

export function VerifyEmailResend({ verified, t }: Props) {
  const router = useRouter();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [note, setNote] = useState<Note | null>(null);

  async function resend() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      await api.post("/client/auth/verify-email/resend");
      setNote({ tone: "success", text: t.resendSent });
    } catch (error) {
      if (isAlreadyVerified(error)) {
        setNote({ tone: "success", text: t.alreadyVerified });
        startRefresh(() => router.refresh());
      } else {
        const reference = errorText.reference(error);
        setNote({ tone: "danger", text: [errorText.message(error), reference].filter(Boolean).join(" ") });
      }
    } finally {
      setBusy(false);
    }
  }

  if (verified && !note) return null;
  return (
    <div className="grid justify-items-start gap-2">
      {verified ? null : (
        <Button variant="secondary" size="sm" startIcon={<Mail aria-hidden="true" />} loading={busy || refreshing} onClick={resend}>
          {t.resend}
        </Button>
      )}
      {/* Always rendered while the button is, so a screen reader sees the text appear. */}
      <p
        role="status"
        aria-live="polite"
        className={cn("text-small font-medium", note?.tone === "danger" ? "text-danger-ink" : "text-success-ink")}
      >
        {busy ? <span className="sr-only">{t.resending}</span> : note?.text}
      </p>
    </div>
  );
}
