"use client";
// PreferencesForm: currency and the marketing opt-in of a retail account. Only the keys that changed are sent
// (`PATCH /store/v1/me`; marketingOptIn writes a consent record). The currency is mirrored in the `gsm_currency` cookie,
// which the shop reads for visitors.
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { api } from "@/lib/api/browser";
import type { AccountMe } from "@/lib/api/types";
import { CURRENCY_COOKIE } from "@/lib/currency-cookie";
import { useErrorText } from "@/lib/i18n/error-text";
import type { AccountMessages } from "@/lib/i18n/messages/account";
import { FormAlert } from "@/components/auth/form-alert";
import { useFocusOnFeedback } from "@/components/auth/use-focus-on-feedback";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "@/components/auth/form-errors";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

/** What a person edits here. */
export type PreferencesValues = { currency: string; marketingOptIn: boolean };

/** The body of the PATCH: only the keys that differ from what the account holds. */
export function changedPreferences(
  values: PreferencesValues,
  saved: PreferencesValues,
): { currency?: string; marketingOptIn?: boolean } {
  const changes: { currency?: string; marketingOptIn?: boolean } = {};
  if (values.currency !== saved.currency) changes.currency = values.currency;
  if (values.marketingOptIn !== saved.marketingOptIn) changes.marketingOptIn = values.marketingOptIn;
  return changes;
}

export type PreferencesFormProps = {
  /** What the account holds now. `currency` is the one the shop shows (account, else cookie, else the base currency). */
  initial: { currency: string; marketingOptIn: boolean };
  currencies: { code: string; name: string }[];
  t: AccountMessages["settings"]["preferences"];
};

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
}

export function PreferencesForm({ initial, currencies, t }: PreferencesFormProps) {
  const router = useRouter();
  const errorText = useErrorText();
  const [saved, setSaved] = useState(initial);
  const [currency, setCurrency] = useState(initial.currency);
  const [marketing, setMarketing] = useState(initial.marketingOptIn);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusOnFeedback(feedback, formRef);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const changes = changedPreferences({ currency, marketingOptIn: marketing }, saved);
    if (Object.keys(changes).length === 0) {
      toast.info(t.nothingChanged);
      return;
    }
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    try {
      const me = await api.patch<AccountMe>(FAMILY_ROUTES.store.profile, changes);
      if (changes.currency) setCookie(CURRENCY_COOKIE, me.currency ?? changes.currency);
      setSaved({ currency, marketingOptIn: marketing });
      toast.success(t.saved);
      router.refresh();
    } catch (error) {
      setFeedback(feedbackFrom(error, errorText, ["currency", "marketingOptIn"]));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-5">
      <div className="grid items-start gap-5 sm:grid-cols-2">
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
