// Merchant application. Static page; the form reads `?ref=` (an invite's referral code) in the browser behind <Suspense>.
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeading } from "@/components/auth/auth-heading";
import { FormSkeleton } from "@/components/auth/form-skeleton";
import { MerchantRegisterForm } from "@/components/auth/merchant-register-form";
import { countryOptions } from "@/lib/countries";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { auth } from "@/lib/i18n/messages/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(auth);
  return { title: t.register.metaTitle, robots: { index: false, follow: false } };
}

export default async function MerchantRegisterPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages(auth)]);
  return (
    <>
      <AuthHeading title={t.register.title} subtitle={t.register.subtitle} />
      <Suspense fallback={<FormSkeleton fields={6} hint turnstile />}>
        <MerchantRegisterForm locale={locale} countries={countryOptions(locale)} t={{ fields: t.fields, shared: t.shared, register: t.register }} />
      </Suspense>
    </>
  );
}
