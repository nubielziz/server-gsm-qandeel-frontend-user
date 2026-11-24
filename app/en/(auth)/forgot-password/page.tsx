// Forgot password (one form for every account). Fully static page: the form reads no query.
import type { Metadata } from "next";
import { AuthHeading } from "@/components/auth/auth-heading";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { auth } from "@/lib/i18n/messages/auth";

export function generateMetadata(): Metadata {
  const t = auth;
  return { title: t.forgot.metaTitle, robots: { index: false, follow: false } };
}

export default function ForgotPasswordPage() {
  const t = auth;
  return (
    <>
      <AuthHeading title={t.forgot.title} subtitle={t.forgot.subtitle} />
      <ForgotPasswordForm t={{ fields: t.fields, shared: t.shared, forgot: t.forgot }} />
    </>
  );
}
