// Create an account: one form that collects the full details (first name, last name, email, phone, country and a password) and
// emails a link that finishes the sign-up (an account of the retail rank; backend decision 079, shop decision 011). There is no
// choice to make: merchant accounts are opened by our team, and one quiet line says so. The page is static: the form reads no query,
// and the menu of countries (the shop's cached config) sits behind <Suspense> with a same-size skeleton. Never indexed.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthHeading, authLinkClass } from "@/components/auth/auth-heading";
import { SignUpSkeleton } from "@/components/auth/sign-up-skeleton";
import { SignUpSlot } from "@/components/auth/sign-up-slot";
import { sitePath } from "@/lib/site-path";
import { auth } from "@/lib/i18n/messages/auth";

export function generateMetadata(): Metadata {
  const t = auth;
  return { title: t.signUp.metaTitle, robots: { index: false, follow: false } };
}

export default function SignUpPage() {
  const t = auth;
  return (
    <>
      <AuthHeading title={t.signUp.title} subtitle={t.signUp.subtitle} />
      <div className="grid gap-6">
        <Suspense fallback={<SignUpSkeleton />}>
          <SignUpSlot />
        </Suspense>
        <p className="text-center text-body text-ink-muted">
          {t.signUp.haveAccount}{" "}
          <Link href={sitePath("/sign-in")} className={authLinkClass}>
            {t.shared.signIn}
          </Link>
        </p>
        <p className="text-center text-small text-ink-muted">
          {t.signUp.merchantNote}{" "}
          <Link href={sitePath("/become-a-merchant")} className={authLinkClass}>
            {t.signUp.merchantLink}
          </Link>
        </p>
      </div>
    </>
  );
}
