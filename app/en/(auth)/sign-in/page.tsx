// Sign in (one form for every account) and the landing of the emailed sign-in link (`?token=`). The page itself is static; the
// form reads `?next=` and `?token=` in the browser, so it sits behind <Suspense> with a same-size skeleton. Never indexed.
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeading } from "@/components/auth/auth-heading";
import { SignInFlow } from "@/components/auth/sign-in-flow";
import { SignInSkeleton } from "@/components/auth/sign-in-skeleton";
import { auth } from "@/lib/i18n/messages/auth";

export function generateMetadata(): Metadata {
  const t = auth;
  return { title: t.signIn.metaTitle, robots: { index: false, follow: false } };
}

export default function SignInPage() {
  const t = auth;
  return (
    <>
      <AuthHeading title={t.signIn.title} subtitle={t.signIn.subtitle} />
      <Suspense fallback={<SignInSkeleton />}>
        <SignInFlow t={{ fields: t.fields, shared: t.shared, signIn: t.signIn }} />
      </Suspense>
    </>
  );
}
