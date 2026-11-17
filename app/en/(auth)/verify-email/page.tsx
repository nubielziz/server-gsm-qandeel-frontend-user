// Customer email confirmation (`/verify-email?token=`, sent after staff change an email). A button confirms and signs
// the customer in. Static page; the action reads the token in the browser behind <Suspense>.
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeading } from "@/components/auth/auth-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { VerifyEmailAction } from "@/components/auth/verify-email-action";
import { auth } from "@/lib/i18n/messages/auth";

export function generateMetadata(): Metadata {
  const t = auth;
  return { title: t.verifyEmail.metaTitle, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default function VerifyEmailPage() {
  const t = auth;
  return (
    <>
      <AuthHeading title={t.verifyEmail.title} />
      <Suspense
        fallback={
          <div aria-busy="true" className="grid gap-5">
            <div>
              <p className="text-body text-ink-muted">{t.verifyEmail.customerText}</p>
            </div>
            <Skeleton className="h-12 rounded-control" />
          </div>
        }
      >
        <VerifyEmailAction surface="customer" t={{ shared: t.shared, signIn: t.signIn, verifyEmail: t.verifyEmail }} />
      </Suspense>
    </>
  );
}
