"use client";
// SignInFlow: the one sign-in form for customers AND merchants (handoff §6.1, plan D1). `POST /client/auth/sign-in`
// (email + password + Turnstile) answers `{ kind, next }`: `kind` picks the area, `next` the step still to do.
// Sign-in runs in the BROWSER (Set-Cookie must reach the browser), never in a Server Action. Steps:
//   password   email + password + Turnstile → `api.signIn()` → `done` | `totp` | `password`
//   magic      customer email link (MagicLinkForm); always offered under the form
//   totp       merchant 6-digit code → POST /client/auth/2fa
//   customer-new-password  `next: password` for a customer (temporary password) → POST /store/v1/me/password
//   merchant-new-password  `next: password` for a merchant (temporary password) → POST /client/auth/password/change
//              → `totp` (continue with the code) | `done`
//   link       `/sign-in?token=` from the magic-link mail: a button, never auto-submitted (mail scanners)
// A 401 is always "wrong email or password" and never reveals whether the email exists. After success a merchant's saved
// sign-up language is applied (lib/merchant/signup-locale.ts), then router.replace(target) and router.refresh() so the
// header shows the signed-in state. `?as=` is not a choice any more: an old link's value only decides which tab the forgot
// page and the sign-up page open on.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Mail, Store } from "lucide-react";
import { api } from "@/lib/api/browser";
import { ApiError, isApiError } from "@/lib/api/errors";
import type { MerchantMe, MerchantPasswordChangeResult, SmartSignInResult } from "@/lib/api/types";
import { localePath, type Locale } from "@/lib/i18n/config";
import { useErrorText } from "@/lib/i18n/error-text";
import type { AuthMessages } from "@/lib/i18n/messages/auth";
import { applySignupLocale } from "@/lib/merchant/signup-locale";
import { Turnstile } from "@/components/turnstile";
import { Button, ButtonLink } from "@/components/ui/button";
import { Divider } from "@/components/ui/divider";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { authLinkClass } from "./auth-heading";
import { CustomerLinkConfirm } from "./customer-link-confirm";
import { FormAlert } from "./form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "./form-errors";
import { MagicLinkForm } from "./magic-link-form";
import { targetAfterSignIn, type SignInKind } from "./safe-next";
import { useFocusOnFeedback } from "./use-focus-on-feedback";
import { useTurnstile } from "./use-turnstile";

type Step = "password" | "magic" | "totp" | "customer-new-password" | "merchant-new-password" | "link";

export type SignInFlowProps = {
  locale: Locale;
  t: Pick<AuthMessages, "fields" | "shared" | "signIn">;
};

function StepHeading({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h2 className="text-heading text-ink">{title}</h2>
      <p className="mt-1.5 text-body text-ink-muted">{text}</p>
    </div>
  );
}

export function SignInFlow({ locale, t }: SignInFlowProps) {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [step, setStep] = useState<Step>(token ? "link" : "password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // "Your sign-in expired": shown on the form a step sent the visitor back to.
  const [notice, setNotice] = useState<string | null>(null);

  // An old `?as=merchant` link only picks the default tab of the pages the links below open.
  const asQuery = params.get("as") === "merchant" ? "?as=merchant" : "";

  /** Signs in: apply a merchant's sign-up language, go to the target, then refresh so the server parts see the session. */
  async function finish(area: SignInKind) {
    if (area === "merchant") {
      await applySignupLocale({
        getMe: () => api.get<MerchantMe>("/client/auth/me"),
        setLocale: (value) => api.patch("/client/profile", { locale: value }),
      });
    }
    router.replace(targetAfterSignIn(area, params.get("next"), locale));
    router.refresh();
  }

  /** The answer of the smart sign-in: `kind` picks the area, `next` the step still to do. */
  function onSignedIn(result: SmartSignInResult) {
    setNotice(null);
    if (result.next === "done") return finish(result.kind);
    if (result.kind === "merchant") {
      setPassword("");
      setStep(result.next === "totp" ? "totp" : "merchant-new-password");
      return;
    }
    // A customer has no second step: `password` (a temporary password) is the only one the API sends.
    if (result.next === "password") {
      setStep("customer-new-password");
      return;
    }
    throw new ApiError({ status: 200, code: "INVALID_RESPONSE", title: "Unexpected sign-in step" });
  }

  /** A step's pending session ended (10 minutes): back to the form with a sentence, nothing kept. */
  function startAgain() {
    setPassword("");
    setNotice(t.signIn.expired);
    setStep("password");
  }

  if (step === "link" && token) {
    return (
      <CustomerLinkConfirm
        token={token}
        target={targetAfterSignIn("customer", params.get("next"), locale)}
        strings={{ ...t.signIn.link, requestNewLink: t.shared.requestNewLink }}
        onRequestNewLink={() => setStep("magic")}
      />
    );
  }

  if (step === "totp") {
    return (
      <TotpStep
        t={t}
        onDone={() => finish("merchant")}
        onExpired={startAgain}
        onBack={() => {
          setPassword("");
          setNotice(null);
          setStep("password");
        }}
      />
    );
  }

  if (step === "customer-new-password") {
    return (
      <NewPasswordStep
        t={t}
        copy={t.signIn.newPassword}
        onExpired={startAgain}
        save={async (newPassword) => {
          // The pending session becomes a full one; the answer carries the new CSRF token (lib/api/browser.ts keeps it).
          await api.post("/store/v1/me/password", { currentPassword: password, newPassword });
          await finish("customer");
        }}
      />
    );
  }

  if (step === "merchant-new-password") {
    return (
      <NewPasswordStep
        t={t}
        copy={t.signIn.merchantNewPassword}
        onExpired={startAgain}
        save={async (newPassword) => {
          const result = await api.post<MerchantPasswordChangeResult | undefined>("/client/auth/password/change", { password: newPassword });
          if (result?.next === "totp") setStep("totp");
          else if (result?.next === "done") await finish("merchant");
          else throw new ApiError({ status: 200, code: "INVALID_RESPONSE", title: "Unexpected password step" });
        }}
      />
    );
  }

  if (step === "magic") {
    return (
      <div className="grid gap-6">
        <StepHeading title={t.signIn.magic.title} text={t.signIn.magic.text} />
        <MagicLinkForm
          locale={locale}
          defaultEmail={email}
          strings={{
            email: t.fields.email,
            emailPlaceholder: t.fields.emailPlaceholder,
            submit: t.signIn.magic.submit,
            sentText: t.signIn.magic.sentText,
            sentTitle: t.shared.checkEmailTitle,
            useDifferentEmail: t.shared.useDifferentEmail,
            securityCheckWait: t.shared.securityCheckWait,
          }}
        >
          <Button
            variant="secondary"
            size="lg"
            block
            onClick={() => {
              setNotice(null);
              setStep("password");
            }}
          >
            {t.signIn.magic.usePassword}
          </Button>
        </MagicLinkForm>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <PasswordStep
        locale={locale}
        t={t}
        notice={notice}
        forgotHref={`${localePath(locale, "/forgot-password")}${asQuery}`}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        onSignedIn={onSignedIn}
      />
      <Divider label={t.signIn.or} />
      <div className="grid gap-3">
        <Button
          variant="secondary"
          size="md"
          block
          startIcon={<Mail aria-hidden="true" />}
          onClick={() => {
            setNotice(null);
            setStep("magic");
          }}
        >
          {t.signIn.magicLinkCustomers}
        </Button>
        <ButtonLink href={localePath(locale, "/merchant/register")} variant="secondary" size="md" block startIcon={<Store aria-hidden="true" />}>
          {t.signIn.applyMerchant}
        </ButtonLink>
      </div>
      <p className="text-center text-body text-ink-muted">
        {t.signIn.noAccount}{" "}
        <Link href={`${localePath(locale, "/sign-up")}${asQuery}`} className={authLinkClass}>
          {t.signIn.createAccount}
        </Link>
      </p>
    </div>
  );
}

type PasswordStepProps = {
  locale: Locale;
  t: SignInFlowProps["t"];
  /** A sentence to show at once (the session of a later step expired). */
  notice: string | null;
  forgotHref: string;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  /** Called with the API's answer; may throw an ApiError for an answer the site has no step for. */
  onSignedIn: (result: SmartSignInResult) => void | Promise<void>;
};

function PasswordStep({ locale, t, notice, forgotHref, email, setEmail, password, setPassword, onSignedIn }: PasswordStepProps) {
  const errorText = useErrorText();
  const ts = useTurnstile();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(() => (notice ? { fields: {}, message: notice, reference: null } : NO_FEEDBACK));
  useFocusOnFeedback(feedback, form);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const required = errorText.field({ field: "", code: "required", message: "" }) ?? "";
    const missing: Record<string, string> = {};
    if (!email.trim().includes("@")) missing.email = required;
    if (!password) missing.password = required;
    if (Object.keys(missing).length) {
      setFeedback({ fields: missing, message: null, reference: null });
      return;
    }
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    let leaving = false;
    try {
      const turnstileToken = await ts.ensureToken();
      if (!turnstileToken) {
        setFeedback({ fields: {}, message: t.shared.securityCheckWait, reference: null });
        return;
      }
      const result = await api.signIn({ email: email.trim(), password }, turnstileToken);
      leaving = true;
      await onSignedIn(result);
    } catch (error) {
      leaving = false;
      // Wrong email, wrong password and "no password yet" are one 401: one generic sentence, never a sign-out (handoff §3.4).
      setFeedback(
        isApiError(error) && error.status === 401
          ? { fields: {}, message: t.signIn.invalidCredentials, reference: null }
          : feedbackFrom(error, errorText, ["email", "password"]),
      );
    } finally {
      if (!leaving) setBusy(false);
      // A Turnstile token works once, even when the request failed: ask the widget for the next one.
      ts.reset();
    }
  }

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="grid gap-5">
      <Input
        type="email"
        name="email"
        label={t.fields.email}
        placeholder={t.fields.emailPlaceholder}
        leading={<Mail aria-hidden="true" />}
        autoComplete="username"
        inputMode="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={feedback.fields.email}
      />
      <div>
        <PasswordInput
          name="password"
          label={t.fields.password}
          placeholder={t.fields.passwordPlaceholder}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={feedback.fields.password}
        />
        <div className="flex justify-end">
          <Link href={forgotHref} className={authLinkClass}>
            {t.signIn.forgot}
          </Link>
        </div>
      </div>
      <Turnstile onToken={ts.setToken} resetKey={ts.resetKey} lang={locale} />
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <Button type="submit" size="lg" block loading={busy}>
        {t.signIn.submit}
      </Button>
    </form>
  );
}

type TotpStepProps = { t: SignInFlowProps["t"]; onDone: () => void | Promise<void>; onExpired: () => void; onBack: () => void };

function TotpStep({ t, onDone, onExpired, onBack }: TotpStepProps) {
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
      await api.post("/client/auth/2fa", { code });
      leaving = true;
      await onDone();
    } catch (error) {
      leaving = false;
      if (isApiError(error) && error.status === 401) {
        // A wrong code is a 422 on `code`, never a 401 (handoff §3.4): a 401 means the pending session ended.
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

type NewPasswordStepProps = {
  t: SignInFlowProps["t"];
  copy: { title: string; text: string; submit: string };
  /** Sends the new password and goes on (the next step, or the target). Throws the ApiError of a refused call. */
  save: (newPassword: string) => Promise<void>;
  onExpired: () => void;
};

/**
 * The forced "choose your own password" step after a temporary password, for both kinds. The two routes name the
 * field differently (`newPassword` for a customer, `password` for a merchant): both land under the first input.
 */
function NewPasswordStep({ t, copy, save, onExpired }: NewPasswordStepProps) {
  const errorText = useErrorText();
  const form = useRef<HTMLFormElement>(null);
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  useFocusOnFeedback(feedback, form);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (next !== confirm) {
      setFeedback({ fields: { confirm: t.fields.passwordsDontMatch }, message: null, reference: null });
      return;
    }
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    let leaving = false;
    try {
      await save(next);
      leaving = true;
    } catch (error) {
      if (isApiError(error) && error.status === 401) {
        onExpired();
        return;
      }
      setFeedback(feedbackFrom(error, errorText, ["newPassword", "currentPassword", "password"]));
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="grid gap-5">
      <StepHeading title={copy.title} text={copy.text} />
      <PasswordInput
        name="newPassword"
        label={t.fields.newPassword}
        hint={t.fields.passwordRules}
        autoComplete="new-password"
        required
        value={next}
        onChange={(e) => setNext(e.target.value)}
        error={feedback.fields.newPassword ?? feedback.fields.currentPassword ?? feedback.fields.password}
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
        {copy.submit}
      </Button>
    </form>
  );
}
