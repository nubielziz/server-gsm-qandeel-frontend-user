// Sign in (customers and merchants) and the landing of the customer email sign-in link (`?token=`). The page itself is
// static; the form reads `?as=`, `?next=` and `?token=` in the browser, so it sits behind <Suspense> with a same-size
// skeleton. Never indexed.
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeading } from "@/components/auth/auth-heading";
import { SignInFlow } from "@/components/auth/sign-in-flow";
import { SignInSkeleton } from "@/components/auth/sign-in-skeleton";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { auth } from "@/lib/i18n/messages/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(auth);
  return { title: t.signIn.metaTitle, robots: { index: false, follow: false } };
}

export default async function SignInPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages(auth)]);
  return (
    <>
      <AuthHeading title={t.signIn.title} subtitle={t.signIn.subtitle} />
      <Suspense fallback={<SignInSkeleton />}>
        <SignInFlow locale={locale} t={{ surfaces: t.surfaces, fields: t.fields, shared: t.shared, signIn: t.signIn }} />
      </Suspense>
    </>
  );
}
