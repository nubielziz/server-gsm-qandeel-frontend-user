// Become a merchant. Not a form: the visitor is told to message the team on WhatsApp, where a team member completes the steps,
// and staff then open the account at a merchant rank in the admin console and send the set-password link. The site sends
// nothing. Fully static page: it reads no query, so a link with any query opens it unchanged.
// No number configured (NEXT_PUBLIC_MERCHANT_WHATSAPP, build-time): no WhatsApp link, no steps (they all start with
// WhatsApp); the subtitle says the team opens accounts and the only action is the support page.
import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading, authLinkClass } from "@/components/auth/auth-heading";
import { MerchantWhatsAppActions } from "@/components/auth/merchant-whatsapp-actions";
import { ButtonLink } from "@/components/ui/button";
import { merchantWhatsApp, whatsAppLink } from "@/lib/contact/whatsapp";
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
          <MerchantWhatsAppActions
            href={whatsAppLink(contact.digits, t.becomeMerchant.message)}
            display={contact.display}
            t={t.becomeMerchant}
          />
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
