"use client";
// SignInFlow: the one sign-in form, for every account (one kind of account: the rank decides what the account can do, never the form).
// `POST /client/auth/sign-in` (email + password + Turnstile) answers `{ next, rank }`: `next` is the step still to do.
// Sign-in runs in the BROWSER (Set-Cookie must reach the browser), never in a Server Action. Steps:
//   password       email + password + Turnstile → `api.signIn()` → `done` | `totp` | `password`
//   magic          the email link (MagicLinkForm); always offered under the form
//   totp           the 6-digit code → POST /client/auth/2fa (TotpStep)
//   new-password   `next: password` (a temporary password) → POST /client/auth/password/change {password}
//                  → `totp` (continue with the code) | `done`
//   link           `/sign-in?token=` from the email-link mail: a box and a button, never auto-submitted (mail scanners)
// A 401 is always "wrong email or password" and never reveals whether the email exists. After success
// router.replace(target) and router.refresh() so the header shows the signed-in state. `?as=` is not read: an old link that
// carries it opens the same form.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Mail, Store } from "lucide-react";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import type { SignInResult } from "@/lib/api/types";
import { useErrorText } from "@/lib/i18n/error-text";
import { useMounted } from "@/lib/use-mounted";
import type { AuthMessages } from "@/lib/i18n/messages/auth";
import { sitePath } from "@/lib/site-path";
import { Turnstile } from "@/components/turnstile";
import { Button, ButtonLink } from "@/components/ui/button";
import { Divider } from "@/components/ui/divider";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { authLinkClass, StepHeading } from "./auth-heading";
import { changeTemporaryPassword } from "./auth-requests";
import { FormAlert } from "./form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "./form-errors";
import { LinkConfirm } from "./link-confirm";
import { MagicLinkForm } from "./magic-link-form";
import { targetAfterSignIn } from "./safe-next";
import { moveAfterPasswordChange, moveAfterSignIn, pendingSessionEnded, type SignInStep } from "./sign-in-steps";
import { TotpStep } from "./totp-step";
import { useFocusOnFeedback } from "./use-focus-on-feedback";
import { useTurnstile } from "./use-turnstile";

export type SignInFlowProps = {
  t: Pick<AuthMessages, "fields" | "shared" | "signIn"> & { signUp: Pick<AuthMessages["signUp"], "errors"> };
  /** The countries the "finish your account" form offers, `{ code, name }`: the shop's tax-rate countries, else the full list. */
  countries: readonly { code: string; name: string }[];
};

export function SignInFlow({ t, countries }: SignInFlowProps) {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [step, setStep] = useState<SignInStep>(token ? "link" : "password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // "Your sign-in expired": shown on the form a step sent the visitor back to.
  const [notice, setNotice] = useState<string | null>(null);

  /** Signs in: go to the target, then refresh so the server parts see the session. */
  function finish() {
    router.replace(targetAfterSignIn(params.get("next")));
    router.refresh();
  }

  /** Goes where a step's answer says: the target, the code step or (for a temporary password) the new-password step. */
  function go(move: "finish" | "totp" | "new-password") {
    setNotice(null);
    if (move === "finish") return finish();
    setPassword("");
    setStep(move);
  }

  /** The answer of the password form; throws an ApiError for an answer the site has no step for. */
  function onSignedIn(result: SignInResult) {
    go(moveAfterSignIn(result));
  }

  /** "Not you? Sign out" on the link page: the link is spent and its session is gone. Back to the plain form, token dropped. */
  function afterLinkSignOut() {
    const next = params.get("next");
    setNotice(null);
    setPassword("");
    setStep("password");
    router.replace(next ? `${sitePath("/sign-in")}?next=${encodeURIComponent(next)}` : sitePath("/sign-in"));
    router.refresh();
  }

  /** A step's pending session ended (10 minutes): back to the form with a sentence, nothing kept. */
  function startAgain() {
    setPassword("");
    setNotice(t.signIn.expired);
    setStep("password");
  }

  if (step === "link" && token) {
    return (
      <LinkConfirm
        token={token}
        strings={{ ...t.signIn.link, requestNewLink: t.shared.requestNewLink }}
        finish={{
          countries,
          t: { fields: t.fields, errors: t.signUp.errors, finish: t.signIn.finish, continue: t.signIn.link.continue },
        }}
        onSignedIn={go}
        onRequestNewLink={() => setStep("magic")}
        onSignedOut={afterLinkSignOut}
      />
    );
  }

  if (step === "totp") {
    return (
      <TotpStep
        t={t}
        onDone={finish}
        onExpired={startAgain}
        onBack={() => {
          setPassword("");
          setNotice(null);
          setStep("password");
        }}
      />
    );
  }

  if (step === "new-password") {
    return (
      <NewPasswordStep
        t={t}
        copy={t.signIn.newPassword}
        onExpired={startAgain}
        save={async (newPassword) => {
          // The pending session becomes a full one (or asks for the code); the answer's CSRF token is kept by lib/api/browser.ts.
          go(moveAfterPasswordChange(await changeTemporaryPassword(newPassword)));
        }}
      />
    );
  }

  if (step === "magic") {
    return (
      <div className="grid gap-6">
        <StepHeading title={t.signIn.magic.title} text={t.signIn.magic.text} />
        <MagicLinkForm
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
        t={t}
        notice={notice}
        forgotHref={sitePath("/forgot-password")}
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
          {t.signIn.emailLink}
        </Button>
        <ButtonLink
          href={sitePath("/become-a-merchant")}
          variant="secondary"
          size="md"
          block
          startIcon={<Store aria-hidden="true" />}
        >
          {t.signIn.merchantPrices}
        </ButtonLink>
      </div>
      <p className="text-center text-body text-ink-muted">
        {t.signIn.noAccount}{" "}
        <Link href={sitePath("/sign-up")} className={authLinkClass}>
          {t.signIn.createAccount}
        </Link>
      </p>
    </div>
  );
}

type PasswordStepProps = {
  t: SignInFlowProps["t"];
  /** A sentence to show at once (the session of a later step expired). */
  notice: string | null;
  forgotHref: string;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  /** Called with the API's answer; may throw an ApiError for an answer the site has no step for. */
  onSignedIn: (result: SignInResult) => void | Promise<void>;
};

function PasswordStep({ t, notice, forgotHref, email, setEmail, password, setPassword, onSignedIn }: PasswordStepProps) {
  const errorText = useErrorText();
  const ts = useTurnstile();
  const form = useRef<HTMLFormElement>(null);
  const mounted = useMounted();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(() =>
    notice ? { fields: {}, message: notice, reference: null } : NO_FEEDBACK,
  );
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
    <form ref={form} method="post" onSubmit={onSubmit} noValidate className="grid gap-5">
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
      <Turnstile onToken={ts.setToken} resetKey={ts.resetKey} />
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <Button type="submit" size="lg" block loading={busy} disabled={!mounted}>
        {t.signIn.submit}
      </Button>
    </form>
  );
}

type NewPasswordStepProps = {
  t: SignInFlowProps["t"];
  copy: { title: string; text: string; submit: string };
  /** Sends the new password and goes on (the code step, or the target). Throws the ApiError of a refused call. */
  save: (newPassword: string) => Promise<void>;
  onExpired: () => void;
};

/** The forced "choose your own password" step after a temporary password, for every account. The error lands under the first input. */
function NewPasswordStep({ t, copy, save, onExpired }: NewPasswordStepProps) {
  const errorText = useErrorText();
  const form = useRef<HTMLFormElement>(null);
  const mounted = useMounted();
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
      if (pendingSessionEnded(error)) {
        onExpired();
        return;
      }
      setFeedback(feedbackFrom(error, errorText, ["password"]));
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  return (
    <form ref={form} method="post" onSubmit={onSubmit} noValidate className="grid gap-5">
      <StepHeading title={copy.title} text={copy.text} />
      <PasswordInput
        name="newPassword"
        label={t.fields.newPassword}
        hint={t.fields.passwordRules}
        autoComplete="new-password"
        required
        value={next}
        onChange={(e) => setNext(e.target.value)}
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
      <Button type="submit" size="lg" block loading={busy} disabled={!mounted}>
        {copy.submit}
      </Button>
    </form>
  );
}
