"use client";
// SignInFlow: the one sign-in form (interim until the smart sign-in route exists, handoff §6.1). A "Customer | Merchant"
// switch picks which login route runs. Sign-in runs in the BROWSER (Set-Cookie must reach the browser), never in a
// Server Action. Steps:
//   password   customer → POST /store/v1/auth/login (Turnstile) → `done` | `password` (temporary password → new-password)
//              merchant → POST /client/auth/login → `done` | `totp`
//   magic      customer email link (MagicLinkForm)
//   totp       merchant 6-digit code → POST /client/auth/2fa
//   new-password  customer with a temporary password → POST /store/v1/me/password
//   link       `/sign-in?token=` from the magic-link mail: a button, never auto-submitted (mail scanners)
// After success: router.replace(target) then router.refresh() so the header shows the signed-in state.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Mail, Store, UserRound } from "lucide-react";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import type { MerchantLoginResult, StoreLoginResult } from "@/lib/api/types";
import { localePath, type Locale } from "@/lib/i18n/config";
import { useErrorText } from "@/lib/i18n/error-text";
import type { AuthMessages } from "@/lib/i18n/messages/auth";
import { Turnstile } from "@/components/turnstile";
import { Button, ButtonLink } from "@/components/ui/button";
import { Divider } from "@/components/ui/divider";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { authLinkClass } from "./auth-heading";
import { CustomerLinkConfirm } from "./customer-link-confirm";
import { FormAlert } from "./form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "./form-errors";
import { MagicLinkForm } from "./magic-link-form";
import { safeNext } from "./safe-next";
import { useFocusOnFeedback } from "./use-focus-on-feedback";
import { useTurnstile } from "./use-turnstile";

type Surface = "customer" | "merchant";
type Step = "password" | "magic" | "totp" | "new-password" | "link";

export type SignInFlowProps = {
  locale: Locale;
  t: Pick<AuthMessages, "surfaces" | "fields" | "shared" | "signIn">;
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
  const [surface, setSurface] = useState<Surface>(params.get("as") === "merchant" ? "merchant" : "customer");
  const [step, setStep] = useState<Step>(token ? "link" : "password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const home = (s: Surface) => localePath(locale, s === "merchant" ? "/merchant" : "/account");
  const target = safeNext(params.get("next"), home(surface));

  /** Signs in: go to the target, then refresh so the server parts see the new session. */
  function finish(to: string = target) {
    router.replace(to);
    router.refresh();
  }

  function changeSurface(next: string) {
    const value: Surface = next === "merchant" ? "merchant" : "customer";
    setSurface(value);
    setStep("password");
  }

  if (step === "link" && token) {
    return (
      <CustomerLinkConfirm
        token={token}
        target={safeNext(params.get("next"), home("customer"))}
        strings={{ ...t.signIn.link, requestNewLink: t.shared.requestNewLink }}
        onRequestNewLink={() => {
          setSurface("customer");
          setStep("magic");
        }}
      />
    );
  }

  const switcher = (
    <SegmentedControl
      label={t.surfaces.label}
      fullWidth
      value={surface}
      onValueChange={changeSurface}
      options={[
        { value: "customer", label: t.surfaces.customer, icon: <UserRound aria-hidden="true" /> },
        { value: "merchant", label: t.surfaces.merchant, icon: <Store aria-hidden="true" /> },
      ]}
    />
  );

  if (step === "totp") {
    return (
      <TotpStep
        t={t}
        onDone={() => finish()}
        onBack={() => {
          setPassword("");
          setStep("password");
        }}
      />
    );
  }

  if (step === "new-password") {
    return <NewPasswordStep t={t} currentPassword={password} onDone={() => finish()} />;
  }

  if (step === "magic") {
    return (
      <div className="grid gap-6">
        {switcher}
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
          <Button variant="secondary" size="lg" block onClick={() => setStep("password")}>
            {t.signIn.magic.usePassword}
          </Button>
        </MagicLinkForm>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {switcher}
      <PasswordStep
        key={surface}
        locale={locale}
        surface={surface}
        t={t}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        onDone={() => finish()}
        onTotp={() => setStep("totp")}
        onNewPassword={() => setStep("new-password")}
      />
      <Divider label={t.signIn.or} />
      {surface === "customer" ? (
        <Button variant="secondary" size="lg" block startIcon={<Mail aria-hidden="true" />} onClick={() => setStep("magic")}>
          {t.signIn.magicLinkInstead}
        </Button>
      ) : (
        <ButtonLink href={localePath(locale, "/merchant/register")} variant="secondary" size="lg" block startIcon={<Store aria-hidden="true" />}>
          {t.signIn.applyMerchant}
        </ButtonLink>
      )}
      <p className="text-center text-body text-ink-muted">
        {t.signIn.noAccount}{" "}
        <Link href={`${localePath(locale, "/sign-up")}?as=${surface}`} className={authLinkClass}>
          {t.signIn.createAccount}
        </Link>
      </p>
    </div>
  );
}

type PasswordStepProps = {
  locale: Locale;
  surface: Surface;
  t: SignInFlowProps["t"];
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  onDone: () => void;
  onTotp: () => void;
  onNewPassword: () => void;
};

function PasswordStep({ locale, surface, t, email, setEmail, password, setPassword, onDone, onTotp, onNewPassword }: PasswordStepProps) {
  const errorText = useErrorText();
  const ts = useTurnstile();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  useFocusOnFeedback(feedback, form);
  const customer = surface === "customer";

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
      if (customer) {
        const turnstileToken = await ts.ensureToken();
        if (!turnstileToken) {
          setFeedback({ fields: {}, message: t.shared.securityCheckWait, reference: null });
          return;
        }
        const result = await api.post<StoreLoginResult>("/store/v1/auth/login", { email: email.trim(), password }, { turnstileToken });
        leaving = true;
        if (result.next === "password") onNewPassword();
        else onDone();
      } else {
        const result = await api.post<MerchantLoginResult>("/client/auth/login", { email: email.trim(), password });
        leaving = true;
        if (result.next === "totp") onTotp();
        else onDone();
      }
    } catch (error) {
      // Wrong email, wrong password and "no password yet" are one 401: one generic sentence (handoff §3.4).
      setFeedback(
        isApiError(error) && error.status === 401
          ? { fields: {}, message: t.signIn.invalidCredentials, reference: null }
          : feedbackFrom(error, errorText, ["email", "password"]),
      );
    } finally {
      if (!leaving) setBusy(false);
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
          <Link href={`${localePath(locale, "/forgot-password")}?as=${surface}`} className={authLinkClass}>
            {t.signIn.forgot}
          </Link>
        </div>
      </div>
      {customer ? <Turnstile onToken={ts.setToken} resetKey={ts.resetKey} lang={locale} /> : null}
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <Button type="submit" size="lg" block loading={busy}>
        {t.signIn.submit}
      </Button>
    </form>
  );
}

function TotpStep({ t, onDone, onBack }: { t: SignInFlowProps["t"]; onDone: () => void; onBack: () => void }) {
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
      onDone();
    } catch (error) {
      // A wrong code is a 422 on `code`, never a 401 (handoff §3.4).
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

function NewPasswordStep({ t, currentPassword, onDone }: { t: SignInFlowProps["t"]; currentPassword: string; onDone: () => void }) {
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
      // The pending session becomes a full one; the answer carries the new CSRF token (lib/api/browser.ts keeps it).
      await api.post("/store/v1/me/password", { currentPassword, newPassword: next });
      leaving = true;
      onDone();
    } catch (error) {
      setFeedback(feedbackFrom(error, errorText, ["newPassword", "currentPassword"]));
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="grid gap-5">
      <StepHeading title={t.signIn.newPassword.title} text={t.signIn.newPassword.text} />
      <PasswordInput
        name="newPassword"
        label={t.fields.newPassword}
        hint={t.fields.passwordRules}
        autoComplete="new-password"
        required
        value={next}
        onChange={(e) => setNext(e.target.value)}
        error={feedback.fields.newPassword ?? feedback.fields.currentPassword}
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
        {t.signIn.newPassword.submit}
      </Button>
    </form>
  );
}
