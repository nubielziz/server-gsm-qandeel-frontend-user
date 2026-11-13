"use client";
// MerchantRegisterForm: a reseller applies for a merchant account (`POST /client/auth/register` → 204). The answer is the
// same for a new and a known email, so the page only says "if the details are valid, check your email". The account
// starts as `pending`: staff approve it later (handoff §4.15). `?ref=` prefills the referral code from an invite link.
// The request carries `X-Turnstile-Token` (BH §6.2: the API ignores it until it switches the check on); the widget is reset
// after every submit. The API takes no language, so after an Arabic sign-up a marker `{ locale, at }` is left in
// localStorage and the first sign-in saves the language on the account (lib/merchant/signup-locale.ts, plan D4).
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { api } from "@/lib/api/browser";
import type { CountryOption } from "@/lib/countries";
import { localePath, type Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import type { AuthMessages } from "@/lib/i18n/messages/auth";
import { rememberSignupLocale } from "@/lib/merchant/signup-locale";
import { Turnstile } from "@/components/turnstile";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useUiText } from "@/components/ui/ui-text";
import { authLinkClass } from "./auth-heading";
import { FormAlert } from "./form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "./form-errors";
import { useFocusOnFeedback } from "./use-focus-on-feedback";
import { useTurnstile } from "./use-turnstile";

export type MerchantRegisterFormProps = {
  locale: Locale;
  t: Pick<AuthMessages, "fields" | "shared" | "register">;
  /** Countries sorted by the server (`countryOptions(locale)`). The list is passed in, not built here: Node and the
   * browser sort Arabic names differently, which would break hydration. */
  countries: CountryOption[];
};

const FIELDS = ["name", "email", "password", "company", "phone", "country", "referralCode"] as const;

export function MerchantRegisterForm({ locale, t, countries }: MerchantRegisterFormProps) {
  const params = useSearchParams();
  const errorText = useErrorText();
  const ui = useUiText();
  const ts = useTurnstile();
  const form = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState({
    name: "",
    email: "",
    password: "",
    company: "",
    phone: "",
    country: "",
    referralCode: (params.get("ref") ?? "").trim().slice(0, 32),
  });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useFocusOnFeedback(feedback, form);

  const set = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));
  const signIn = localePath(locale, "/sign-in");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const required = errorText.field({ field: "", code: "required", message: "" }) ?? "";
    const missing: Record<string, string> = {};
    if (!values.name.trim()) missing.name = required;
    if (!values.email.trim().includes("@")) missing.email = required;
    if (!values.password) missing.password = required;
    if (!values.country) missing.country = required;
    if (Object.keys(missing).length) {
      setFeedback({ fields: missing, message: null, reference: null });
      return;
    }
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    const optional = (text: string) => (text.trim() ? text.trim() : undefined);
    try {
      const turnstileToken = await ts.ensureToken();
      if (!turnstileToken) {
        setFeedback({ fields: {}, message: t.shared.securityCheckWait, reference: null });
        return;
      }
      await api.post(
        "/client/auth/register",
        {
          name: values.name.trim(),
          email: values.email.trim(),
          password: values.password,
          country: values.country,
          company: optional(values.company),
          phone: optional(values.phone),
          referralCode: optional(values.referralCode),
        },
        { turnstileToken },
      );
      // The API has no language field: remember the page's language for the first sign-in (English clears an old marker).
      rememberSignupLocale(locale);
      setSentTo(values.email.trim());
    } catch (error) {
      setFeedback(feedbackFrom(error, errorText, FIELDS, { referralCode: t.register.referralInvalid }));
    } finally {
      setBusy(false);
      // A Turnstile token works once, even when the request failed: ask the widget for the next one.
      ts.reset();
    }
  }

  if (sentTo) {
    return (
      <div className="grid gap-5">
        <Alert tone="success" title={t.register.sentTitle}>
          {fmt(t.register.sentText, { email: sentTo })}
        </Alert>
        <ButtonLink href={signIn} size="lg" block>
          {t.shared.signIn}
        </ButtonLink>
      </div>
    );
  }

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="grid gap-5">
      <Input
        name="name"
        label={t.register.name}
        autoComplete="name"
        required
        maxLength={120}
        value={values.name}
        onChange={set("name")}
        error={feedback.fields.name}
      />
      <Input
        type="email"
        name="email"
        label={t.fields.email}
        placeholder={t.fields.emailPlaceholder}
        leading={<Mail aria-hidden="true" />}
        autoComplete="email"
        inputMode="email"
        required
        maxLength={254}
        value={values.email}
        onChange={set("email")}
        error={feedback.fields.email}
      />
      <PasswordInput
        name="password"
        label={t.fields.password}
        hint={t.fields.passwordRules}
        autoComplete="new-password"
        required
        value={values.password}
        onChange={set("password")}
        error={feedback.fields.password}
      />
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <Input
          name="company"
          label={t.register.company}
          optionalLabel={ui.optional}
          autoComplete="organization"
          maxLength={160}
          value={values.company}
          onChange={set("company")}
          error={feedback.fields.company}
        />
        <Input
          type="tel"
          name="phone"
          label={t.register.phone}
          optionalLabel={ui.optional}
          autoComplete="tel"
          inputMode="tel"
          maxLength={40}
          value={values.phone}
          onChange={set("phone")}
          error={feedback.fields.phone}
        />
      </div>
      <Select
        name="country"
        label={t.register.country}
        placeholder={t.register.countryPlaceholder}
        autoComplete="country"
        required
        value={values.country}
        onChange={set("country")}
        options={countries.map((c) => ({ value: c.code, label: c.name }))}
        error={feedback.fields.country}
      />
      <Input
        name="referralCode"
        label={t.register.referralCode}
        optionalLabel={ui.optional}
        autoComplete="off"
        maxLength={32}
        dir="ltr"
        value={values.referralCode}
        onChange={set("referralCode")}
        error={feedback.fields.referralCode}
      />
      <Turnstile onToken={ts.setToken} resetKey={ts.resetKey} lang={locale} />
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <Button type="submit" size="lg" block loading={busy}>
        {t.register.submit}
      </Button>
      <p className="text-center text-body text-ink-muted">
        {t.register.haveAccount}{" "}
        <Link href={signIn} className={authLinkClass}>
          {t.shared.signIn}
        </Link>
      </p>
    </form>
  );
}
