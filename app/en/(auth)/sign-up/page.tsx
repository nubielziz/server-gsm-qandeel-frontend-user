// Create an account: an email and an emailed link that creates the account on first use (an account of the retail rank).
// There is no choice to make: merchant accounts are opened by our team, and one quiet line says so. Fully static page: the
// form reads no query. Never indexed.
import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading, authLinkClass } from "@/components/auth/auth-heading";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
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
        <MagicLinkForm
          strings={{
            email: t.fields.email,
            emailPlaceholder: t.fields.emailPlaceholder,
            hint: t.signUp.form.hint,
            submit: t.signUp.form.submit,
            sentText: t.signUp.form.sentText,
            sentTitle: t.shared.checkEmailTitle,
            useDifferentEmail: t.shared.useDifferentEmail,
            securityCheckWait: t.shared.securityCheckWait,
          }}
        />
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
