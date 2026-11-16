"use client";
// MerchantWhatsApp: the WhatsApp action block of the merchant application page with the referral code of an invite link.
// The page is static, so `?ref=` is read here, in the browser, behind <Suspense>; the fallback is the same block without
// the referral sentence. The code is checked by `referralCodeFrom` (letters and digits only) before it reaches the
// message or the page. The merchant's own referral link is `/merchant/register?ref=CODE` (portal, Referrals).
import { useSearchParams } from "next/navigation";
import { referralCodeFrom, whatsAppLink } from "@/lib/contact/whatsapp";
import { fmt } from "@/lib/i18n/define";
import { MerchantWhatsAppActions, type MerchantWhatsAppText } from "./merchant-whatsapp-actions";

export type MerchantWhatsAppProps = {
  /** The team's number, digits only (for the link). */
  digits: string;
  /** The same number as shown on the page ("+" and the digits). */
  display: string;
  t: MerchantWhatsAppText;
};

export function MerchantWhatsApp({ digits, display, t }: MerchantWhatsAppProps) {
  const code = referralCodeFrom(useSearchParams().get("ref"));
  const text = code ? `${t.message} ${fmt(t.referralSentence, { code })}` : t.message;
  return (
    <MerchantWhatsAppActions
      href={whatsAppLink(digits, text)}
      display={display}
      t={t}
      referral={code ? { code, note: t.referralNote } : null}
    />
  );
}
