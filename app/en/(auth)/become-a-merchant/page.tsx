// Become a merchant. The visitor fills in a short form (first name, last name, email, phone, country; no password) and its WhatsApp
// button opens the team's chat with those details written into the message; a team member completes the steps there, and staff
// then open the account at a merchant rank in the admin console and send the set-password link. The site sends nothing to its API
// and keeps nothing. Static page: it reads no query (a link with any query opens it unchanged); the form sits behind <Suspense>
// with a same-size skeleton because its menu of countries is the shop's tax-rate countries when it has any, else every country
// (the shop's cached config, shared data: `MerchantApplySlot`), the same menu as the sign-up form.
// No number configured (NEXT_PUBLIC_MERCHANT_WHATSAPP, build-time): no WhatsApp link, no steps (they all start with
// WhatsApp); the subtitle says the team opens accounts and the only action is the support page.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthHeading, authLinkClass } from "@/components/auth/auth-heading";
import { MerchantApplySlot } from "@/components/auth/merchant-apply-slot";
import { MerchantApplySkeleton } from "@/components/auth/sign-up-skeleton";
import { ButtonLink } from "@/components/ui/button";
import { merchantWhatsApp } from "@/lib/contact/whatsapp";
import { sitePath } from "@/lib/site-path";
import { auth } from "@/lib/i18n/messages/auth";

export function generateMetadata(): Metadata {
  const t = auth;
  // iOS Safari would turn the number into a phone-call link; it is a WhatsApp number, reached through the button.
  return { title: t.becomeMerchant.metaTitle, robots: { index: false, follow: false }, formatDetection: { telephone: false } };
}

export default function BecomeMerchantPage() {
  const t = auth;
  const contact = merchantWhatsApp();
  return (
    <>
      <AuthHeading
        title={t.becomeMerchant.title}
        subtitle={contact ? t.becomeMerchant.subtitle : t.becomeMerchant.unavailableText}
      />
      <div className="grid gap-6">
        {contact ? (
          <ol role="list" aria-label={t.becomeMerchant.stepsLabel} className="grid gap-3.5">
            {t.becomeMerchant.steps.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-body text-ink">
                <span
                  aria-hidden="true"
                  className="num grid size-7 shrink-0 place-items-center rounded-full bg-primary text-small font-bold text-on-primary"
                >
                  {index + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {contact ? (
          <Suspense fallback={<MerchantApplySkeleton />}>
            <MerchantApplySlot digits={contact.digits} display={contact.display} />
          </Suspense>
        ) : (
          <ButtonLink href={sitePath("/support")} size="lg" block>
            {t.becomeMerchant.contactSupport}
          </ButtonLink>
        )}
        <p className="text-center text-body text-ink-muted">
          {t.becomeMerchant.haveAccount}{" "}
          <Link href={sitePath("/sign-in")} className={authLinkClass}>
            {t.shared.signIn}
          </Link>
        </p>
      </div>
    </>
  );
}
