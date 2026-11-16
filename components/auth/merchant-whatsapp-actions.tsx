// MerchantWhatsAppActions: the WhatsApp button, the optional referral note and the number as text, on the merchant
// application page. Server-compatible (no hooks): the page renders it as the <Suspense> fallback (no referral sentence,
// so the link works before and without JavaScript) and the client component renders it again with the referral code.
// The note's slot is always rendered with a reserved height (two lines), empty or not: AuthShell centres the page
// vertically, so a block that grew when the note appeared would move the heading and the button up at hydration.
import { MessageCircle } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import type { AuthMessages } from "@/lib/i18n/messages/auth";

/** The strings of the action block. The message texts are used by the client component that adds the referral code. */
export type MerchantWhatsAppText = Pick<
  AuthMessages["register"],
  "chat" | "opensNewTab" | "numberLabel" | "message" | "referralSentence" | "referralNote"
>;

export type MerchantWhatsAppActionsProps = {
  /** The `wa.me` link with the prefilled message. */
  href: string;
  /** The number to show as text (as the owner grouped it, or "+" and the digits). */
  display: string;
  t: Pick<MerchantWhatsAppText, "chat" | "opensNewTab" | "numberLabel">;
  /** A valid referral code from the URL: fills the note slot under the button. Without one the slot stays empty (same height). */
  referral?: { code: string; note: string } | null;
};

/** The referral note with the code in its own left-to-right run (a Latin code inside an Arabic sentence). */
function ReferralNote({ code, note }: { code: string; note: string }) {
  const [before, after = ""] = note.split("{code}");
  return (
    <p className="text-center text-small text-ink-muted">
      {before}
      <span dir="ltr" className="font-semibold text-ink">
        {code}
      </span>
      {after}
    </p>
  );
}

export function MerchantWhatsAppActions({ href, display, t, referral }: MerchantWhatsAppActionsProps) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3">
        <ButtonLink href={href} external size="lg" block startIcon={<MessageCircle aria-hidden="true" />}>
          {t.chat}
          <VisuallyHidden> ({t.opensNewTab})</VisuallyHidden>
        </ButtonLink>
        {/* Reserved in both renderings (two lines of this text size cover a typical code at 320px): the block never changes height. */}
        <div className="min-h-[2lh] text-small">
          {referral ? <ReferralNote code={referral.code} note={referral.note} /> : null}
        </div>
      </div>
      <p className="text-body text-ink-muted">
        {t.numberLabel}{" "}
        <span dir="ltr" className="inline-block font-semibold whitespace-nowrap text-ink select-all">
          {display}
        </span>
      </p>
    </div>
  );
}
