// Merchant application. Since 2026-11-16 this is not a form: the visitor is told to message the team on WhatsApp, where a
// team member completes the steps, and staff then create the merchant in the admin console and send the set-password
// link. The site sends nothing. Static page; `?ref=` (a merchant's referral code) is read in the browser behind <Suspense>.
// No number configured (NEXT_PUBLIC_MERCHANT_WHATSAPP, build-time): no WhatsApp link, no steps (they all start with
// WhatsApp); the subtitle says the team opens accounts and the only action is the support page.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthHeading, authLinkClass } from "@/components/auth/auth-heading";
import { MerchantWhatsApp } from "@/components/auth/merchant-whatsapp";
import { MerchantWhatsAppActions } from "@/components/auth/merchant-whatsapp-actions";
import { ButtonLink } from "@/components/ui/button";
import { merchantWhatsApp, whatsAppLink } from "@/lib/contact/whatsapp";
import { localePath } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { auth } from "@/lib/i18n/messages/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(auth);
  // iOS Safari would turn the number into a phone-call link; it is a WhatsApp number, reached through the button.
  return { title: t.register.metaTitle, robots: { index: false, follow: false }, formatDetection: { telephone: false } };
}

export default async function MerchantRegisterPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages(auth)]);
  const contact = merchantWhatsApp();
  const text = {
    chat: t.register.chat,
    opensNewTab: t.register.opensNewTab,
    numberLabel: t.register.numberLabel,
    message: t.register.message,
    referralSentence: t.register.referralSentence,
    referralNote: t.register.referralNote,
  };
  return (
    <>
      <AuthHeading title={t.register.title} subtitle={contact ? t.register.subtitle : t.register.unavailableText} />
      <div className="grid gap-6">
        {contact ? (
          <ol role="list" aria-label={t.register.stepsLabel} className="grid gap-3.5">
            {t.register.steps.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-body text-ink">
                <span
                  aria-hidden="true"
                  className="num grid size-7 shrink-0 place-items-center rounded-full bg-inverse text-small font-bold text-on-inverse"
                >
                  {index + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {contact ? (
          <Suspense
            fallback={
              <MerchantWhatsAppActions href={whatsAppLink(contact.digits, text.message)} display={contact.display} t={text} />
            }
          >
            <MerchantWhatsApp digits={contact.digits} display={contact.display} t={text} />
          </Suspense>
        ) : (
          <ButtonLink href={localePath(locale, "/support")} size="lg" block>
            {t.register.contactSupport}
          </ButtonLink>
        )}
        <p className="text-center text-body text-ink-muted">
          {t.register.haveAccount}{" "}
          <Link href={localePath(locale, "/sign-in")} className={authLinkClass}>
            {t.shared.signIn}
          </Link>
        </p>
      </div>
    </>
  );
}
