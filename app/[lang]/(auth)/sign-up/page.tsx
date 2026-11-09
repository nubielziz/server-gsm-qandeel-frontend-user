// Create an account: choose Customer (email link, no password) or Merchant (reseller application). Static page; the
// chooser reads `?as=` in the browser behind <Suspense>. Never indexed.
import type { Metadata } from "next";
import { Suspense } from "react";
import { Mail, Store, UserRound } from "lucide-react";
import { AuthHeading } from "@/components/auth/auth-heading";
import { SignUpChooser } from "@/components/auth/sign-up-chooser";
import { Input } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { auth, type AuthMessages } from "@/lib/i18n/messages/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(auth);
  return { title: t.signUp.metaTitle, robots: { index: false, follow: false } };
}

/** The same cards and field as the chooser, inert, so nothing moves when the interactive version replaces it. */
function SignUpFallback({ t }: { t: AuthMessages }) {
  return (
    <div aria-busy="true" className="grid gap-6">
      <RadioGroup legend={t.signUp.choose}>
        <RadioCard name="kind" defaultChecked disabled icon={<UserRound aria-hidden="true" />} title={t.signUp.customer.title} description={t.signUp.customer.text} />
        <RadioCard name="kind" disabled icon={<Store aria-hidden="true" />} title={t.signUp.merchant.title} description={t.signUp.merchant.text} />
      </RadioGroup>
      <div className="grid gap-5">
        <Input type="email" label={t.fields.email} hint={t.signUp.customerForm.hint} disabled leading={<Mail aria-hidden="true" />} />
        <Skeleton className="h-[65px] rounded-control" />
        <Skeleton className="h-12 rounded-control" />
      </div>
      <Skeleton className="mx-auto h-11 w-64" />
    </div>
  );
}

export default async function SignUpPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages(auth)]);
  return (
    <>
      <AuthHeading title={t.signUp.title} subtitle={t.signUp.subtitle} />
      <Suspense fallback={<SignUpFallback t={t} />}>
        <SignUpChooser locale={locale} t={{ fields: t.fields, shared: t.shared, signUp: t.signUp, signIn: t.signIn }} />
      </Suspense>
    </>
  );
}
