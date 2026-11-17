// Forgot password (customer or merchant). Static page; the form reads `?as=` in the browser behind <Suspense>.
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeading } from "@/components/auth/auth-heading";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/i18n/messages/auth";

export function generateMetadata(): Metadata {
  const t = auth;
  return { title: t.forgot.metaTitle, robots: { index: false, follow: false } };
}

function ForgotSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-6">
      <div className="grid gap-2">
        <Skeleton className="h-12 rounded-control" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="grid gap-5">
        <div className="grid gap-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-11 rounded-control" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="h-[65px] rounded-control" />
        <Skeleton className="h-12 rounded-control" />
      </div>
      <Skeleton className="mx-auto h-11 w-48" />
    </div>
  );
}

export default function ForgotPasswordPage() {
  const t = auth;
  return (
    <>
      <AuthHeading title={t.forgot.title} subtitle={t.forgot.subtitle} />
      <Suspense fallback={<ForgotSkeleton />}>
        <ForgotPasswordForm t={{ surfaces: t.surfaces, fields: t.fields, shared: t.shared, forgot: t.forgot }} />
      </Suspense>
    </>
  );
}
