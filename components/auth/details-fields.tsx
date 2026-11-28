// DetailsFields: the five inputs a person's details are made of, in the order they are asked: first name and last name side by
// side, then email, phone and country (a menu). Shared by the sign-up form, the "finish your account" form (no email: `hideEmail`;
// the address was proved by the link) and the merchant application, so all ask the same way, with the same autocomplete hints
// (given-name, family-name, email, tel, country), and all draw an error under its field.
// Presentational: the form keeps the values and the errors. Server-compatible (no hooks); the inputs are controlled by the caller.
import { Mail } from "lucide-react";
import type { AuthMessages } from "@/lib/i18n/messages/auth";
import { Input, Select } from "@/components/ui/input";
import { NAME_MAX, type DetailsValues } from "./sign-up-fields";

/** The labels the five inputs need (`auth.fields`). */
export type DetailsFieldsText = Pick<
  AuthMessages["fields"],
  "firstName" | "lastName" | "email" | "emailPlaceholder" | "phone" | "phoneHint" | "country" | "countryPlaceholder"
>;

export type DetailsFieldsProps = {
  /** The values; `email` may be left out when `hideEmail` is set. */
  values: Omit<DetailsValues, "email"> & { email?: string };
  onChange: (key: keyof DetailsValues, value: string) => void;
  /** Leaves the email box out (the finish form: the address is already proved and cannot change here). */
  hideEmail?: boolean;
  /** `{ field: sentence }`; a field with a sentence is marked invalid and shows it. */
  errors: Record<string, string>;
  /** The menu of countries, `{ code, name }` (the value is the code). */
  countries: readonly { code: string; name: string }[];
  t: DetailsFieldsText;
};

export function DetailsFields({ values, onChange, hideEmail = false, errors, countries, t }: DetailsFieldsProps) {
  return (
    <>
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <Input
          name="firstName"
          label={t.firstName}
          autoComplete="given-name"
          maxLength={NAME_MAX}
          required
          value={values.firstName}
          onChange={(e) => onChange("firstName", e.target.value)}
          error={errors.firstName}
        />
        <Input
          name="lastName"
          label={t.lastName}
          autoComplete="family-name"
          maxLength={NAME_MAX}
          required
          value={values.lastName}
          onChange={(e) => onChange("lastName", e.target.value)}
          error={errors.lastName}
        />
      </div>
      {hideEmail ? null : (
        <Input
          type="email"
          name="email"
          label={t.email}
          placeholder={t.emailPlaceholder}
          leading={<Mail aria-hidden="true" />}
          autoComplete="email"
          inputMode="email"
          required
          value={values.email ?? ""}
          onChange={(e) => onChange("email", e.target.value)}
          error={errors.email}
        />
      )}
      <Input
        type="tel"
        name="phone"
        label={t.phone}
        hint={t.phoneHint}
        autoComplete="tel"
        inputMode="tel"
        required
        value={values.phone}
        onChange={(e) => onChange("phone", e.target.value)}
        error={errors.phone}
      />
      <Select
        name="country"
        label={t.country}
        autoComplete="country"
        placeholder={t.countryPlaceholder}
        required
        value={values.country}
        onChange={(e) => onChange("country", e.target.value)}
        options={countries.map((country) => ({ value: country.code, label: country.name }))}
        error={errors.country}
      />
    </>
  );
}
