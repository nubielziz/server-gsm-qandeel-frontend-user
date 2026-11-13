"use client";
// ForgotPasswordForm: asks for an email and sends a reset link. The backend has two forgot routes and no smart one (plan
// §8), so the page keeps a Customer | Merchant choice (default from `?as=`, customer without it). Both routes take the
// Turnstile token in `X-Turnstile-Token` (merchants since BH §6.2: ignored by the API until it switches the check on, so
// the site always sends it). The success text is the same for every address: the page never says whether an account
// exists (handoff §4.1, §5.6).
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Mail, Store, UserRound } from "lucide-react";
import { api } from "@/lib/api/browser";
import { localePath, type Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import type { AuthMessages } from "@/lib/i18n/messages/auth";
import { Turnstile } from "@/components/turnstile";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { authLinkClass } from "./auth-heading";
import { FormAlert } from "./form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "./form-errors";
import { useFocusOnFeedback } from "./use-focus-on-feedback";
import { useTurnstile } from "./use-turnstile";

export type ForgotPasswordFormProps = {
  locale: Locale;
  t: Pick<AuthMessages, "surfaces" | "fields" | "shared" | "forgot">;
};

export function ForgotPasswordForm({ locale, t }: ForgotPasswordFormProps) {
  const params = useSearchParams();
  const errorText = useErrorText();
  const ts = useTurnstile();
  const form = useRef<HTMLFormElement>(null);
  const [surface, setSurface] = useState<"customer" | "merchant">(params.get("as") === "merchant" ? "merchant" : "customer");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const customer = surface === "customer";

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
        setFeedback({ fields: {}, message: t.shared.securityCheckWait, reference: null });
        return;
      }
      await api.post(customer ? "/store/v1/auth/password/forgot" : "/client/auth/password/forgot", { email: address }, { turnstileToken });
      setSentTo(address);
    } catch (error) {
      setFeedback(feedbackFrom(error, errorText, ["email"]));
    } finally {
      setBusy(false);
      ts.reset();
    }
  }

  const signIn = localePath(locale, "/sign-in");

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
      <div className="grid gap-2">
        <SegmentedControl
          label={t.surfaces.label}
          fullWidth
          value={surface}
          onValueChange={(value) => {
            setSurface(value === "merchant" ? "merchant" : "customer");
            setFeedback(NO_FEEDBACK);
          }}
          options={[
            { value: "customer", label: t.surfaces.customer, icon: <UserRound aria-hidden="true" /> },
            { value: "merchant", label: t.surfaces.merchant, icon: <Store aria-hidden="true" /> },
          ]}
        />
        <p className="text-small text-ink-muted">{t.forgot.chooseHint}</p>
      </div>
      <form ref={form} onSubmit={onSubmit} noValidate className="grid gap-5">
        <Input
          type="email"
          name="email"
          label={t.fields.email}
          hint={customer ? t.forgot.customerHint : undefined}
          placeholder={t.fields.emailPlaceholder}
          leading={<Mail aria-hidden="true" />}
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={feedback.fields.email}
        />
        <Turnstile key="ts" onToken={ts.setToken} resetKey={ts.resetKey} lang={locale} />
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
