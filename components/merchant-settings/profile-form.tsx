"use client";
// Profile (PATCH /client/profile): name, company, phone and country are editable; the email is shown read-only with
// its verification badge (no route changes it). Only the changed keys are sent, then the page refreshes.
import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/browser";
import type { MerchantMe } from "@/lib/api/types";
import type { MerchantSettingsMessages } from "@/lib/i18n/messages/merchant-settings";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select, controlClasses } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ProblemAlert, useFocusFirstInvalid, useFormProblem } from "./form-problem";

export type ProfileValues = { name: string; company: string; phone: string; country: string };

type Props = {
  /** Country names rendered by the server: Intl.DisplayNames differs between Node and browsers (hydration). */
  countries: { code: string; name: string }[];
  initial: ProfileValues;
  email: string;
  emailVerified: boolean;
  t: MerchantSettingsMessages["profile"];
  fieldTexts: MerchantSettingsMessages["fieldErrors"];
  optional: string;
};

const FIELDS = ["name", "company", "phone", "country"];

export function ProfileForm({ countries, initial, email, emailVerified, t, fieldTexts, optional }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<ProfileValues>(initial);
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const { problem, fail, failFields, clear } = useFormProblem(fieldTexts);
  useFocusFirstInvalid(formRef, problem);

  const changed: Partial<ProfileValues> = {};
  for (const key of ["name", "company", "phone", "country"] as const) {
    const now = key === "country" ? values[key] : values[key].trim();
    if (now !== initial[key]) changed[key] = now;
  }
  const dirty = Object.keys(changed).length > 0;
  const busy = saving || refreshing;
  const set = (key: keyof ProfileValues) => (value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || busy) return;
    if (!values.name.trim()) {
      failFields({ name: t.nameRequired });
      return;
    }
    clear();
    setSaving(true);
    try {
      await api.patch<MerchantMe>("/client/profile", changed);
      toast.success(t.saved);
      startRefresh(() => router.refresh());
    } catch (error) {
      fail(error, FIELDS);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card as="section">
      <form ref={formRef} onSubmit={onSubmit} noValidate aria-busy={busy || undefined} className="flex min-w-0 flex-col">
        <CardHeader title={t.title} description={t.description} divided />
        <CardBody className="grid gap-5">
          <ProblemAlert problem={problem} />
          <Input
            label={t.name}
            required
            name="name"
            autoComplete="name"
            maxLength={120}
            value={values.name}
            onChange={(e) => set("name")(e.target.value)}
            error={problem?.fields.name}
          />
          <Field label={t.email} id="profile-email" hint={emailVerified ? t.emailHintVerified : t.emailHintUnverified}>
            {(control) => (
              <div dir="ltr" className="relative flex items-center">
                <input
                  {...control}
                  type="email"
                  dir="ltr"
                  readOnly
                  value={email}
                  className={cn(controlClasses, "h-11 pe-32 text-start")}
                />
                <span className="absolute inset-y-0 end-2 flex items-center">
                  {emailVerified ? <Badge tone="success">{t.verified}</Badge> : <Badge tone="warning">{t.notVerified}</Badge>}
                </span>
              </div>
            )}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              label={t.company}
              optionalLabel={optional}
              name="company"
              autoComplete="organization"
              maxLength={160}
              value={values.company}
              onChange={(e) => set("company")(e.target.value)}
              error={problem?.fields.company}
            />
            <Input
              label={t.phone}
              optionalLabel={optional}
              name="phone"
              type="tel"
              autoComplete="tel"
              maxLength={40}
              value={values.phone}
              onChange={(e) => set("phone")(e.target.value)}
              error={problem?.fields.phone}
            />
          </div>
          <Select
            label={t.country}
            required
            name="country"
            autoComplete="country"
            placeholder={t.countryPlaceholder}
            options={countries.map((c) => ({ value: c.code, label: c.name }))}
            value={values.country}
            onChange={(e) => set("country")(e.target.value)}
            error={problem?.fields.country}
          />
        </CardBody>
        <CardFooter>
          <p className="text-small text-ink-subtle" aria-live="polite">
            {dirty ? t.footerHint : t.footerClean}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              disabled={!dirty || busy}
              onClick={() => {
                setValues(initial);
                clear();
              }}
            >
              {t.discard}
            </Button>
            <Button type="submit" loading={busy} disabled={!dirty}>
              {t.save}
            </Button>
          </div>
          <span role="status" className="sr-only">
            {busy ? t.saving : ""}
          </span>
        </CardFooter>
      </form>
    </Card>
  );
}
