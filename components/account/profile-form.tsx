"use client";
// ProfileForm: name, phone and country of a retail account (`PATCH /store/v1/me`). Only the keys that
// changed are sent; an emptied phone is sent as `""` (that clears it); a name is 2 to 120 characters and cannot be
// cleared; the country is one of the countries the shop has a tax rate for (`GET /store/v1/config` `taxRates`, chosen
// by the page), and the API answers 422 `unsupported` on `country` for any other. A country change resets the account's
// currency on the API: the answer's `currency` is written to (or removed from) the `gsm_currency` cookie, which the
// shop reads for the prices it shows, and the route is refreshed. The email is read-only: no route changes it.
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api/browser";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { isApiError } from "@/lib/api/errors";
import type { AccountMe, StoreMeInput } from "@/lib/api/types";
import { CURRENCY_COOKIE } from "@/lib/currency-cookie";
import { fmt } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import { useMounted } from "@/lib/use-mounted";
import type { AccountMessages } from "@/lib/i18n/messages/account";
import { ltr } from "@/lib/merchant/format";
import { isOnlyDialCode } from "@/lib/phone/dial";
import { FormAlert } from "@/components/auth/form-alert";
import { useFocusOnFeedback } from "@/components/auth/use-focus-on-feedback";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "@/components/auth/form-errors";
import { Button } from "@/components/ui/button";
import { CountrySelect } from "@/components/ui/country-select";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { toast } from "@/components/ui/toast";

/** The API takes a name of 2 to 120 characters. */
const NAME_MIN = 2;
const NAME_MAX = 120;
/** And a phone of at most 40. */
const PHONE_MAX = 40;

/** The three values a person edits. */
export type StoreProfileValues = { name: string; phone: string; country: string };

/**
 * The body of the PATCH: only what differs from what the account holds. The API trims the name and the phone, so trimmed
 * values are compared; an emptied phone is sent as "" (that clears it), and a phone box that holds only a calling code (the
 * list of the phone box wrote it and no number followed) is an emptied one; an empty country is never sent (a saved country can
 * be changed, not removed).
 */
export function changedStoreProfile(values: StoreProfileValues, saved: StoreProfileValues): StoreMeInput {
  const changes: StoreMeInput = {};
  const name = values.name.trim();
  const phone = isOnlyDialCode(values.phone) ? "" : values.phone.trim();
  if (name !== saved.name) changes.name = name;
  if (phone !== saved.phone) changes.phone = phone;
  if (values.country !== "" && values.country !== saved.country) changes.country = values.country;
  return changes;
}

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
  const mounted = useMounted();
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
    const changes = changedStoreProfile({ name, phone, country }, saved);
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
      const me = await api.patch<AccountMe>(FAMILY_ROUTES.store.profile, changes);
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
    <form ref={formRef} method="post" onSubmit={onSubmit} noValidate className="grid gap-5">
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
        <PhoneInput
          name="phone"
          label={t.phone}
          maxLength={PHONE_MAX}
          value={phone}
          onValueChange={setPhone}
          countryHint={country}
          hint={t.phoneHint}
          error={feedback.fields.phone}
        />
      </div>
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <CountrySelect
          name="country"
          label={t.country}
          // Without a saved country the field asks for one; once saved the country can be changed, not removed.
          placeholder={saved.country === "" ? t.countryPlaceholder : undefined}
          value={country}
          onValueChange={setCountry}
          countries={countries}
          hint={t.countryHint}
          error={feedback.fields.country}
        />
        <Input name="email" type="email" label={t.email} autoComplete="email" readOnly value={email} hint={t.emailNote} />
      </div>
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <div>
        <Button type="submit" loading={busy} disabled={!mounted}>
          {t.save}
        </Button>
      </div>
    </form>
  );
}
