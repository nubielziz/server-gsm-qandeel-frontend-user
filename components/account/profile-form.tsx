"use client";
// ProfileForm: name, phone and country of the signed-in customer (`PATCH /store/v1/me`, BH §7.2). Only the keys that
// changed are sent; an emptied phone is sent as `""` (that clears it); a name is 2 to 120 characters and cannot be
// cleared; the country is one of the countries the shop has a tax rate for (`GET /store/v1/config` `taxRates`, chosen
// by the page), and the API answers 422 `unsupported` on `country` for any other. A country change resets the account's
// currency on the API: the answer's `currency` is written to (or removed from) the `gsm_currency` cookie, which the
// shop reads for the prices it shows, and the route is refreshed. The email is read-only: no route changes it.
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import type { StoreMe, StoreMeInput } from "@/lib/api/types";
import { CURRENCY_COOKIE } from "@/lib/currency-cookie";
import { fmt } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import type { AccountMessages } from "@/lib/i18n/messages/account";
import { ltr } from "@/lib/merchant/format";
import { FormAlert } from "@/components/auth/form-alert";
import { useFocusOnFeedback } from "@/components/auth/use-focus-on-feedback";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "@/components/auth/form-errors";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

/** The API takes a name of 2 to 120 characters. */
const NAME_MIN = 2;
const NAME_MAX = 120;
/** And a phone of at most 40. */
const PHONE_MAX = 40;

export type ProfileFormProps = {
  /** What the account holds now. `currency` is the account's own choice (null when none). */
  initial: { name: string; phone: string; country: string; currency: string | null };
  email: string;
  /** The countries the shop sells to (plus the saved one), named in the page language. */
  countries: { code: string; name: string }[];
  t: AccountMessages["settings"]["profile"];
};

/** Writes the shop currency cookie from the account's currency, or removes it when the account has none. */
function setCurrencyCookie(code: string | null) {
  document.cookie = code
    ? `${CURRENCY_COOKIE}=${encodeURIComponent(code)}; path=/; max-age=31536000; SameSite=Lax`
    : `${CURRENCY_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

export function ProfileForm({ initial, email, countries, t }: ProfileFormProps) {
  const router = useRouter();
  const errorText = useErrorText();
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [country, setCountry] = useState(initial.country);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusOnFeedback(feedback, formRef);

  /** The texts that replace the generic ones: a name outside 2 to 120 characters, a country the shop does not sell to. */
  function overridesFor(error: unknown): Record<string, string> {
    if (!isApiError(error)) return {};
    const out: Record<string, string> = {};
    const nameError = error.fieldError("name");
    if (nameError && (nameError.code === "too_small" || nameError.code === "too_big")) out.name = t.nameInvalid;
    if (error.fieldError("country")?.code === "unsupported") out.country = t.countryUnsupported;
    return out;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    // Only what changed: the API trims the name and the phone, so compare trimmed values.
    const changes: StoreMeInput = {};
    const nextName = name.trim();
    const nextPhone = phone.trim();
    if (nextName !== saved.name) changes.name = nextName;
    if (nextPhone !== saved.phone) changes.phone = nextPhone; // "" clears the phone
    if (country !== "" && country !== saved.country) changes.country = country;
    if (Object.keys(changes).length === 0) {
      toast.info(t.nothingChanged);
      return;
    }
    if (changes.name !== undefined && (changes.name.length < NAME_MIN || changes.name.length > NAME_MAX)) {
      setFeedback({ fields: { name: t.nameInvalid }, message: null, reference: null });
      return;
    }
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    try {
      const me = await api.patch<StoreMe>("/store/v1/me", changes);
      const countryChanged = changes.country !== undefined;
      if (countryChanged) setCurrencyCookie(me.currency); // the API reset the currency to the country's default
      const currencyChanged = countryChanged && me.currency !== null && me.currency !== saved.currency;
      setSaved({ name: me.name, phone: me.phone, country: me.country, currency: me.currency });
      setName(me.name);
      setPhone(me.phone);
      setCountry(me.country);
      toast.success(t.saved, currencyChanged ? fmt(t.currencyChanged, { currency: ltr(me.currency ?? "") }) : undefined);
      router.refresh();
    } catch (error) {
      setFeedback(feedbackFrom(error, errorText, ["name", "phone", "country"], overridesFor(error)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-5">
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <Input
          name="name"
          label={t.name}
          autoComplete="name"
          maxLength={NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={feedback.fields.name}
        />
        <Input
          name="phone"
          type="tel"
          label={t.phone}
          autoComplete="tel"
          inputMode="tel"
          maxLength={PHONE_MAX}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          hint={t.phoneHint}
          error={feedback.fields.phone}
        />
      </div>
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <Select
          name="country"
          label={t.country}
          autoComplete="country"
          // Without a saved country the first option asks for one; once saved the country can be changed, not removed.
          placeholder={saved.country === "" ? t.countryPlaceholder : undefined}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          options={countries.map((c) => ({ value: c.code, label: c.name }))}
          hint={t.countryHint}
          error={feedback.fields.country}
        />
        <Input name="email" type="email" label={t.email} autoComplete="email" readOnly value={email} hint={t.emailNote} />
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
