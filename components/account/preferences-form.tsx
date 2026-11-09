"use client";
// PreferencesForm: language, currency and the marketing opt-in of the signed-in customer. Only the keys that changed
// are sent (`PATCH /store/v1/me`; marketingOptIn writes a consent record). The choices are mirrored in the `gsm_locale`
// and `gsm_currency` cookies, which the shop reads for visitors; the language is a route param, so a language change
// navigates to the same page in the other language.
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api/browser";
import type { StoreMe } from "@/lib/api/types";
import { CURRENCY_COOKIE, LOCALE_COOKIE, switchLocalePath, type Locale } from "@/lib/i18n/config";
import { useErrorText } from "@/lib/i18n/error-text";
import type { AccountMessages } from "@/lib/i18n/messages/account";
import { FormAlert } from "@/components/auth/form-alert";
import { useFocusOnFeedback } from "@/components/auth/use-focus-on-feedback";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "@/components/auth/form-errors";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

export type PreferencesFormProps = {
  /** What the account holds now. `currency` is the one the shop shows (account, else cookie, else the base currency). */
  initial: { locale: Locale; currency: string; marketingOptIn: boolean };
  currencies: { code: string; name: string }[];
  t: AccountMessages["settings"]["preferences"];
};

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
}

export function PreferencesForm({ initial, currencies, t }: PreferencesFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const errorText = useErrorText();
  const [saved, setSaved] = useState(initial);
  const [language, setLanguage] = useState<Locale>(initial.locale);
  const [currency, setCurrency] = useState(initial.currency);
  const [marketing, setMarketing] = useState(initial.marketingOptIn);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusOnFeedback(feedback, formRef);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const changes: { locale?: Locale; currency?: string; marketingOptIn?: boolean } = {};
    if (language !== saved.locale) changes.locale = language;
    if (currency !== saved.currency) changes.currency = currency;
    if (marketing !== saved.marketingOptIn) changes.marketingOptIn = marketing;
    if (Object.keys(changes).length === 0) {
      toast.info(t.nothingChanged);
      return;
    }
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    try {
      const me = await api.patch<StoreMe>("/store/v1/me", changes);
      if (changes.currency) setCookie(CURRENCY_COOKIE, me.currency ?? changes.currency);
      if (changes.locale) {
        setCookie(LOCALE_COOKIE, changes.locale);
        // The language is a route param: a full navigation to this page in the new language.
        window.location.assign(switchLocalePath(pathname, changes.locale));
        return;
      }
      setSaved({ locale: initial.locale, currency, marketingOptIn: marketing });
      toast.success(t.saved);
      router.refresh();
    } catch (error) {
      setFeedback(feedbackFrom(error, errorText, ["locale", "currency", "marketingOptIn"]));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-5">
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <Select
          name="locale"
          label={t.language}
          value={language}
          onChange={(e) => setLanguage(e.target.value === "ar" ? "ar" : "en")}
          options={[
            { value: "en", label: t.languageNames.en },
            { value: "ar", label: t.languageNames.ar },
          ]}
          error={feedback.fields.locale}
        />
        <Select
          name="currency"
          label={t.currency}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          options={currencies.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))}
          error={feedback.fields.currency}
        />
      </div>
      <p className="-mt-2 text-small text-ink-subtle">{t.currencyHint}</p>
      <div className="rounded-card border border-line px-4">
        <Switch label={t.marketing} description={t.marketingHint} checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
      </div>
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <div>
        <Button type="submit" loading={busy}>
          {t.save}
        </Button>
      </div>
    </form>
  );
}
