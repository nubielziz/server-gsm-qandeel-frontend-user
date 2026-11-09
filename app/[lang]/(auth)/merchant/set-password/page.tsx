// Merchant password link (`/merchant/set-password?token=`: password reset AND staff invitation). Static page; the form reads the
// token in the browser behind <Suspense>. Never indexed, and no Referer is sent (the token is in the URL).
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeading } from "@/components/auth/auth-heading";
import { FormSkeleton } from "@/components/auth/form-skeleton";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { auth } from "@/lib/i18n/messages/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(auth);
  return { title: t.setPassword.metaTitle, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function SetPasswordPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages(auth)]);
  return (
    <>
      <AuthHeading title={t.setPassword.title} subtitle={t.setPassword.subtitle} />
      <Suspense fallback={<FormSkeleton fields={2} hint />}>
        <SetPasswordForm surface="merchant" locale={locale} t={{ fields: t.fields, shared: t.shared, setPassword: t.setPassword }} />
      </Suspense>
    </>
  );
}
